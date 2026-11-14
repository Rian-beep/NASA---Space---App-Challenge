#!/usr/bin/env python3
"""Download the polar ice-prospectivity checkpoint and, when possible, run one inference.

Writes src/lib/lfm/fixtures/contexts.json. Numeric prospectivity is written only
when it is a finite model output in [0, 1]. This script never downloads the
12 GB base tokenizer bundle or the pretrained backbone weights.
"""

from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import sys
import traceback
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "lfm"
REPO = RAW / "repo"
SOMBENCH = RAW / "sombench"
VENV = RAW / ".venv"
FIXTURE = ROOT / "src" / "lib" / "lfm" / "fixtures" / "contexts.json"
SCIENCE_FIXTURES = ROOT / "src" / "lib" / "science" / "fixtures"
LOG_PATH = RAW / "last_inference.json"

ICE_REPO = "nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model"
DATA_REPO = "nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression"
CODE_URL = "https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model"
CKPT_NAME = "ni_lfm_ps8_all_modalities_s42.ckpt"
CKPT_BYTES = 1_693_049_641

MODEL_ID = "nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model"
CHECKPOINT = f"{ICE_REPO}/{CKPT_NAME}"
SOURCE_URLS = [
    "https://huggingface.co/nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model",
    "https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model",
    "https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model",
    "https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression",
    "https://science.nasa.gov/science-research/artificial-intelligence-lunar-foundation-model/",
]
LIMITATIONS = [
    "This regresses the Coyan et al. (2025) knowledge-driven fuzzy-overlay map. It is not measured ice.",
    "Not a resource estimate, and not evidence that ice is present at a location.",
    "Not validated for landing-site certification, ISRU, or hazard clearance.",
    "The backbone maintains no geodetic frame.",
    "Polar only: within 10° of each pole, evaluated at 240 m per pixel.",
    "Outputs must never replace JPL Horizons ephemerides or LOLA horizon visibility.",
]

# Training-config channel order. Aspect is two bands.
MODALITY_FILES = [
    ("aspect", "ASP_SIN_COS", 2),
    ("CUR", "CUR", 1),
    ("DICE", "DICE", 1),
    ("LPSR", "LPSR", 1),
    ("LPSR_DEN", "LPSR_DEN", 1),
    ("LPSR_DIS", "LPSR_DIS", 1),
    ("slope", "SLOPE", 1),
    ("TMAX", "TMAX", 1),
]
MEANS = {
    "aspect": [-0.003915, 0.009272],
    "CUR": [0.0],
    "DICE": [0.429733],
    "LPSR": [0.062075],
    "LPSR_DEN": [0.062062],
    "LPSR_DIS": [2115.858434],
    "slope": [8.464441],
    "TMAX": [228.021751],
}
STDS = {
    "aspect": [0.668003, 0.669717],
    "CUR": [0.000280],
    "DICE": [0.454594],
    "LPSR": [0.241292],
    "LPSR_DEN": [0.195937],
    "LPSR_DIS": [2115.858434],
    "slope": [6.172140],
    "TMAX": [47.689147],
}

# Refused downloads. The ice checkpoint is self-contained.
REFUSED_NAMES = {
    "backbone/checkpoint.pt",
    "tokenizers",
}

MOON_R_M = 1_737_400.0
FALSE_EASTING = 500_000.0
FALSE_NORTHING = 500_000.0
SCALE_FACTOR = 0.994
FALLBACK_LON = 0.0
FALLBACK_LAT = -89.5
FALLBACK_SITE = "probe_0e_89_5s"
NEIGHBOURHOOD = 3


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def hf_url(repo: str, filename: str, dataset: bool = False) -> str:
    kind = "datasets" if dataset else "models"
    return f"https://huggingface.co/{kind}/{repo}/resolve/main/{filename}"


def download(url: str, dest: Path, expected_bytes: int | None = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if expected_bytes is not None and dest.is_file() and dest.stat().st_size == expected_bytes:
        print(f"present {dest} ({expected_bytes} bytes)")
        return
    if dest.is_file() and expected_bytes is None and dest.stat().st_size > 0:
        print(f"present {dest}")
        return
    tmp = dest.with_suffix(dest.suffix + ".partial")
    headers = {}
    mode = "wb"
    existing = 0
    if tmp.is_file():
        existing = tmp.stat().st_size
        headers["Range"] = f"bytes={existing}-"
        mode = "ab"
    request = urllib.request.Request(url, headers={"User-Agent": "lunar-window-lfm-fetch"})
    for key, value in headers.items():
        request.add_header(key, value)
    print(f"download {url}")
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            status = getattr(response, "status", 200)
            if status == 200 and mode == "ab":
                mode = "wb"
                existing = 0
            with tmp.open(mode) as handle:
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    handle.write(chunk)
                    existing += len(chunk)
                    if expected_bytes:
                        print(f"  {existing / expected_bytes:.1%}", end="\r", flush=True)
    except Exception:
        print(f"\ndownload failed for {dest.name}; partial file kept at {tmp}")
        raise
    if expected_bytes is not None and tmp.stat().st_size != expected_bytes:
        raise RuntimeError(
            f"{dest.name} is {tmp.stat().st_size} bytes, expected {expected_bytes}"
        )
    tmp.replace(dest)
    print(f"\nsaved {dest}")


def assert_not_refused(filename: str) -> None:
    lowered = filename.lower()
    if lowered in REFUSED_NAMES or lowered.startswith("tokenizers/") or "tokenizer" in lowered:
        raise RuntimeError(f"refusing to download {filename}")
    if lowered.endswith("backbone/checkpoint.pt") or lowered == "checkpoint.pt":
        raise RuntimeError(f"refusing to download base backbone weights: {filename}")


def clone_code() -> None:
    if (REPO / "terratorch_integration" / "lunar_regression_task.py").is_file():
        print(f"repo present at {REPO}")
        return
    if REPO.exists():
        shutil.rmtree(REPO)
    print(f"clone {CODE_URL}")
    subprocess.check_call(
        ["git", "clone", "--depth", "1", CODE_URL, str(REPO)],
    )


def venv_python() -> Path:
    return VENV / "bin" / "python"


def ensure_venv() -> Path:
    python = venv_python()
    if not python.is_file():
        if VENV.exists():
            shutil.rmtree(VENV)
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])
    return python


def runtime_ready(python: Path) -> bool:
    probe = subprocess.run(
        [
            str(python),
            "-c",
            "import torch, terratorch, yaml, rasterio, pyproj, einops, omegaconf, hdf5plugin",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        return False
    version = subprocess.run(
        [str(python), "-c", "import torch; print(torch.__version__)"],
        check=False,
        capture_output=True,
        text=True,
    )
    return "+cu" not in version.stdout


def install_runtime(python: Path) -> None:
    env = os.environ.copy()
    env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    subprocess.check_call([str(python), "-m", "pip", "install", "-U", "pip"], env=env)
    subprocess.check_call(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "torch==2.12.1",
            "torchvision==0.27.1",
            "--index-url",
            "https://download.pytorch.org/whl/cpu",
        ],
        env=env,
    )
    subprocess.check_call(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "terratorch>=1.2.6,<2",
            "lightning>=2.6.5,<3",
            "torchmetrics>=1.9,<2",
            "timm>=1.0.27,<2",
            "einops",
            "omegaconf",
            "pyyaml",
            "rasterio",
            "numpy",
            "pyproj",
            "huggingface_hub",
            "hdf5plugin",
            "peft",
            "vector-quantize-pytorch",
            "tokenizers",
        ],
        env=env,
    )
    # terratorch may pull a CUDA torch. Put the CPU wheel back if that happened.
    probe = subprocess.run(
        [str(python), "-c", "import torch; print(torch.__version__); print(torch.cuda.is_available())"],
        check=False,
        capture_output=True,
        text=True,
    )
    print(probe.stdout)
    if "cu" in probe.stdout.splitlines()[0:1].__repr__().lower() or "+cu" in probe.stdout:
        subprocess.check_call(
            [
                str(python),
                "-m",
                "pip",
                "install",
                "--force-reinstall",
                "torch==2.12.1",
                "torchvision==0.27.1",
                "--index-url",
                "https://download.pytorch.org/whl/cpu",
            ],
            env=env,
        )


def read_tiff(path: Path) -> dict:
    import numpy as np
    import rasterio

    with rasterio.open(path) as dataset:
        array = dataset.read().astype(np.float32)
        transform = dataset.transform
    # Upper-left corner of pixel (0, 0), PixelIsArea. Y scale is stored positive.
    return {
        "array": array,
        "scale": (abs(float(transform.a)), abs(float(transform.e)), 0.0),
        "tie": (0.0, 0.0, 0.0, float(transform.c), float(transform.f), 0.0),
    }


def moon_projected_crs():
    from pyproj import CRS

    # Sphere of radius 1737.4 km. Scale 0.994 and the 500 km false origin match
    # the GeoTIFF keys on the SomBench south-pole tiles (CT_PolarStereographic).
    return CRS.from_proj4(
        "+proj=stere +lat_0=-90 +lon_0=0 +k=0.994 "
        "+x_0=500000 +y_0=500000 +R=1737400 +units=m +no_defs +type=crs"
    )


def moon_geographic_crs():
    from pyproj import CRS

    return CRS.from_proj4("+proj=longlat +R=1737400 +no_defs +type=crs")


def project_lonlat(lon_deg: float, lat_deg: float) -> tuple[float, float]:
    """South-polar stereographic metres matching the SomBench GeoTIFF keys."""
    from pyproj import Transformer

    transformer = Transformer.from_crs(moon_geographic_crs(), moon_projected_crs(), always_xy=True)
    x, y = transformer.transform(lon_deg, lat_deg)
    return float(x), float(y)


def inverse_project(x: float, y: float) -> tuple[float, float]:
    from pyproj import Transformer

    transformer = Transformer.from_crs(moon_projected_crs(), moon_geographic_crs(), always_xy=True)
    lon, lat = transformer.transform(x, y)
    return float(lon), float(lat)


def pixel_center(meta: dict, col: int, row: int) -> tuple[float, float]:
    scale_x, scale_y = meta["scale"][0], meta["scale"][1]
    tie_x, tie_y = meta["tie"][3], meta["tie"][4]
    # RasterPixelIsArea: tiepoint is the upper-left corner of pixel (0, 0).
    x = tie_x + (col + 0.5) * scale_x
    y = tie_y - (row + 0.5) * scale_y
    return x, y


def locate_pixel(meta: dict, x: float, y: float) -> tuple[int, int]:
    scale_x, scale_y = meta["scale"][0], meta["scale"][1]
    tie_x, tie_y = meta["tie"][3], meta["tie"][4]
    col = math.floor((x - tie_x) / scale_x)
    row = math.floor((tie_y - y) / scale_y)
    return col, row


def patch_name(row: int, col: int, layer: str) -> str:
    return f"patch_{row:04d}_{col:04d}_S_80S_{layer}.tif"


def find_demo_sites() -> list[dict]:
    if not SCIENCE_FIXTURES.exists():
        return []
    sites: list[dict] = []
    seen: set[str] = set()

    def add(site_id: str, lon: float, lat: float) -> None:
        if site_id in seen or not math.isfinite(lon) or not math.isfinite(lat):
            return
        seen.add(site_id)
        sites.append({"id": site_id, "eastLongitudeDeg": lon, "latitudeDeg": lat})

    def walk(node) -> None:
        if isinstance(node, dict):
            if {"id", "eastLongitudeDeg", "latitudeDeg"} <= set(node):
                try:
                    add(str(node["id"]), float(node["eastLongitudeDeg"]), float(node["latitudeDeg"]))
                except (TypeError, ValueError):
                    pass
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    for path in SCIENCE_FIXTURES.rglob("*"):
        if path.suffix == ".json":
            try:
                walk(json.loads(path.read_text()))
            except json.JSONDecodeError:
                continue
        elif path.suffix in {".ts", ".tsx", ".js"}:
            text = path.read_text(errors="replace")
            for match in re.finditer(
                r"id:\s*['\"]([^'\"]+)['\"][\s\S]{0,500}?eastLongitudeDeg:\s*([-+0-9.eE]+)[\s\S]{0,200}?latitudeDeg:\s*([-+0-9.eE]+)",
                text,
            ):
                add(match.group(1), float(match.group(2)), float(match.group(3)))
            for match in re.finditer(
                r"id:\s*['\"]([^'\"]+)['\"][\s\S]{0,500}?latitudeDeg:\s*([-+0-9.eE]+)[\s\S]{0,200}?eastLongitudeDeg:\s*([-+0-9.eE]+)",
                text,
            ):
                add(match.group(1), float(match.group(3)), float(match.group(2)))
    return sites


def choose_targets() -> tuple[list[dict], str]:
    sites = find_demo_sites()
    polar = [site for site in sites if site["latitudeDeg"] <= -80.0]
    if polar:
        return polar, "demo sites in src/lib/science/fixtures with latitude <= -80"
    return (
        [
            {
                "id": FALLBACK_SITE,
                "eastLongitudeDeg": FALLBACK_LON,
                "latitudeDeg": FALLBACK_LAT,
                "fallback": True,
            }
        ],
        "no demo sites were present; using 0° E, 89.5° S",
    )


def ensure_patch_layers(row: int, col: int) -> Path:
    folder = SOMBENCH / f"patch_{row:04d}_{col:04d}_S_80S"
    folder.mkdir(parents=True, exist_ok=True)
    for _name, layer, _channels in MODALITY_FILES:
        filename = patch_name(row, col, layer)
        dest = folder / filename
        assert_not_refused(filename)
        download(hf_url(DATA_REPO, filename, dataset=True), dest)
    label = patch_name(row, col, "PRO")
    download(hf_url(DATA_REPO, label, dataset=True), folder / label)
    return folder


def find_covering_patch(lon: float, lat: float) -> dict | None:
    """Return the south-pole patch that contains this lon/lat, if one is on the grid."""
    x, y = project_lonlat(lon, lat)
    print(f"projected {lon} E, {lat} -> x={x:.2f} y={y:.2f}")
    anchor = SOMBENCH / "patch_0004_0004_S_80S_SLOPE.tif"
    if not anchor.is_file():
        download(
            hf_url(DATA_REPO, "patch_0004_0004_S_80S_SLOPE.tif", dataset=True),
            anchor,
        )
    meta = read_tiff(anchor)
    if meta["scale"] is None or meta["tie"] is None:
        raise RuntimeError("SomBench GeoTIFF has no model tiepoint")
    scale = meta["scale"][0]
    tile = 256 * scale
    tie_x, tie_y = meta["tie"][3], meta["tie"][4]
    # patch 4,4 upper-left corner.
    col = 4 + math.floor((x - tie_x) / tile)
    row = 4 + math.floor((tie_y - y) / tile)
    if row < 0 or col < 0 or row > 12 or col > 12:
        return None
    slope_name = patch_name(row, col, "SLOPE")
    slope_path = SOMBENCH / slope_name
    try:
        download(hf_url(DATA_REPO, slope_name, dataset=True), slope_path)
    except Exception as exc:
        print(f"patch {row},{col} is not readable: {exc}")
        return None
    patch_meta = read_tiff(slope_path)
    pixel_col, pixel_row = locate_pixel(patch_meta, x, y)
    if not (0 <= pixel_col < 256 and 0 <= pixel_row < 256):
        return None
    return {
        "row": row,
        "col": col,
        "pixel_col": pixel_col,
        "pixel_row": pixel_row,
        "map_x": x,
        "map_y": y,
        "scale_m": scale,
    }


def standardize(name: str, array):
    import numpy as np

    data = np.array(array, dtype=np.float32, copy=True)
    data[~np.isfinite(data)] = 0.0
    mean = np.asarray(MEANS[name], dtype=np.float32).reshape(-1, 1, 1)
    std = np.asarray(STDS[name], dtype=np.float32).reshape(-1, 1, 1)
    if data.shape[0] != mean.shape[0]:
        raise RuntimeError(f"{name} has {data.shape[0]} bands, expected {mean.shape[0]}")
    return (data - mean) / std


def load_task(python_repo: Path, backbone_cfg: Path, ckpt: Path):
    os.environ["PYTHONPATH"] = str(python_repo) + os.pathsep + os.environ.get("PYTHONPATH", "")
    sys.path.insert(0, str(python_repo))
    import torch

    import terratorch_integration.decoders  # noqa: F401
    import terratorch_integration.lunar_register  # noqa: F401
    import terratorch_integration.necks  # noqa: F401
    from terratorch_integration.lunar_regression_task import LunarPixelwiseRegressionTask
    import yaml

    config = yaml.safe_load((RAW / "config.yaml").read_text())
    init_args = config["model"]["init_args"]
    model_args = dict(init_args["model_args"])
    model_args["backbone_cfg"] = str(backbone_cfg)
    model_args["backbone_checkpoint_path"] = None
    task = LunarPixelwiseRegressionTask(
        model_factory=init_args["model_factory"],
        model_args=model_args,
        loss=init_args.get("loss", "mse"),
        ignore_index=init_args.get("ignore_index", -1),
        freeze_backbone=False,
        freeze_decoder=False,
        plot_on_val=0,
    )
    if not hasattr(task, "model"):
        task.configure_models()
    loaded = torch.load(ckpt, map_location="cpu", weights_only=False)
    state = loaded["state_dict"] if isinstance(loaded, dict) and "state_dict" in loaded else loaded
    incompatible = task.load_state_dict(state, strict=False)
    missing = [
        key
        for key in incompatible.missing_keys
        if not key.startswith(("train_metrics", "val_metrics", "test_metrics", "criterion"))
    ]
    if missing:
        raise RuntimeError(f"checkpoint is missing {len(missing)} weight keys, first: {missing[:8]}")
    task.eval()
    return task


def prediction_array(output):
    import numpy as np

    prediction = output.output if hasattr(output, "output") else output
    if isinstance(prediction, dict):
        prediction = prediction.get("output", prediction.get("prediction"))
    if not hasattr(prediction, "detach"):
        raise RuntimeError(f"forward returned {type(prediction).__name__}, not a tensor")
    array = np.squeeze(prediction.detach().float().cpu().numpy())
    if array.shape != (256, 256):
        raise RuntimeError(f"model output shape {array.shape}, expected (256, 256)")
    if not np.isfinite(array).all():
        raise RuntimeError("model output contains non-finite values")
    return array


def predict_batch(task, folders: list[Path]):
    """One forward pass over every selected patch. Returns per-folder maps."""
    import numpy as np
    import torch

    stacked: dict[str, list] = {name: [] for name, _layer, _channels in MODALITY_FILES}
    for folder in folders:
        for name, layer, _channels in MODALITY_FILES:
            band = standardize(name, read_tiff(folder / patch_name_from_folder(folder, layer))["array"])
            stacked[name].append(torch.from_numpy(np.ascontiguousarray(band)))
    tensors = {name: torch.stack(parts, dim=0) for name, parts in stacked.items()}
    errors: list[str] = []

    def volume(output):
        prediction = output.output if hasattr(output, "output") else output
        if isinstance(prediction, dict):
            prediction = prediction.get("output", prediction.get("prediction"))
        if not hasattr(prediction, "detach"):
            raise RuntimeError(f"forward returned {type(prediction).__name__}, not a tensor")
        array = prediction.detach().float().cpu().numpy()
        array = np.squeeze(array)
        if array.ndim == 2:
            array = array[None, ...]
        if array.ndim != 3 or array.shape[0] != len(folders) or array.shape[1:] != (256, 256):
            raise RuntimeError(f"model output shape {array.shape}, expected ({len(folders)}, 256, 256)")
        if not np.isfinite(array).all():
            raise RuntimeError("model output contains non-finite values")
        return array

    def attempt(label: str, call):
        try:
            with torch.no_grad():
                return volume(call())
        except Exception as exc:
            errors.append(f"{label}: {type(exc).__name__}: {exc}")
            return None

    array = attempt("modality dict", lambda: task(tensors))
    if array is None:
        array = attempt("image dict", lambda: task({"image": tensors}))
    if array is None and hasattr(task, "model"):
        array = attempt("model modality dict", lambda: task.model(tensors))
    if array is None:
        raise RuntimeError("forward pass failed; " + " | ".join(errors))

    results = []
    for index, folder in enumerate(folders):
        label_path = folder / patch_name_from_folder(folder, "PRO")
        label_mean = None
        if label_path.is_file():
            label = np.squeeze(read_tiff(label_path)["array"])
            finite = label[np.isfinite(label)]
            if finite.size:
                label_mean = float(finite.mean())
        results.append((array[index], label_mean))
    return results


def predict_patch(task, folder: Path):
    import numpy as np
    import torch

    tensors = {}
    for name, layer, _channels in MODALITY_FILES:
        path = folder / patch_name_from_folder(folder, layer)
        band = standardize(name, read_tiff(path)["array"])
        tensors[name] = torch.from_numpy(np.ascontiguousarray(band)).unsqueeze(0)
    errors: list[str] = []

    def attempt(label: str, call):
        try:
            with torch.no_grad():
                return prediction_array(call())
        except Exception as exc:
            errors.append(f"{label}: {type(exc).__name__}: {exc}")
            return None

    array = attempt("modality dict", lambda: task(tensors))
    if array is None:
        array = attempt("image dict", lambda: task({"image": tensors}))
    if array is None and hasattr(task, "model"):
        array = attempt("model modality dict", lambda: task.model(tensors))
    if array is None:
        raise RuntimeError("forward pass failed; " + " | ".join(errors))
    label_path = folder / patch_name_from_folder(folder, "PRO")
    label_mean = None
    if label_path.is_file():
        label = read_tiff(label_path)["array"]
        label = np.squeeze(label)
        finite = label[np.isfinite(label)]
        if finite.size:
            label_mean = float(finite.mean())
    return array, label_mean


def patch_name_from_folder(folder: Path, layer: str) -> str:
    return f"{folder.name}_{layer}.tif"


def neighbourhood_mean(array, row: int, col: int) -> float:
    import numpy as np

    radius = NEIGHBOURHOOD // 2
    r0 = max(0, row - radius)
    r1 = min(array.shape[0], row + radius + 1)
    c0 = max(0, col - radius)
    c1 = min(array.shape[1], col + radius + 1)
    window = array[r0:r1, c0:c1]
    return float(np.mean(window))


def blank_context(site_id: str, status: str, statement: str, extent: str) -> dict:
    return {
        "status": status,
        "modelId": MODEL_ID,
        "checkpoint": CHECKPOINT,
        "license": "Apache-2.0",
        "task": "polar_ice_prospectivity_regression",
        "siteId": site_id,
        "value": None,
        "patchMean": None,
        "resolutionM": 240,
        "extentNote": extent,
        "retrievedAtUtc": None,
        "sourceUrls": SOURCE_URLS,
        "limitations": LIMITATIONS,
        "statement": statement,
    }


def write_fixture(contexts: dict) -> None:
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps(contexts, indent=2) + "\n")
    print(f"wrote {FIXTURE}")


def main() -> int:
    blockers: list[str] = []
    RAW.mkdir(parents=True, exist_ok=True)
    try:
        assert_not_refused(CKPT_NAME)
        download(hf_url(ICE_REPO, "config.yaml"), RAW / "config.yaml")
        download(hf_url(ICE_REPO, CKPT_NAME), RAW / CKPT_NAME, expected_bytes=CKPT_BYTES)
        # 12 KB pretraining config. Required to build the network. Not a weight file.
        download(
            hf_url(MODEL_ID, "backbone/config.yaml"),
            RAW / "backbone" / "config.yaml",
        )
        clone_code()
        python = ensure_venv()
        if not runtime_ready(python):
            install_runtime(python)
        # The venv interpreter is a symlink to system Python. resolve() would
        # hide it, and the venv is only active when argv[0] is that symlink.
        if Path(sys.prefix).resolve() != VENV.resolve():
            print(f"re-exec in {VENV} (current prefix {sys.prefix})")
            os.execv(str(python), [str(python), "-u", str(Path(__file__).resolve())])
    except Exception as exc:
        blockers.append(f"checkpoint, code, or torch/terratorch setup failed: {exc}")
        traceback.print_exc()

    targets, target_note = choose_targets()
    print(target_note)

    located: list[dict] = []
    if not blockers:
        try:
            for target in targets:
                if target["latitudeDeg"] > -80.0 or target["latitudeDeg"] < -90.0:
                    located.append({**target, "outside": True})
                    continue
                cover = find_covering_patch(target["eastLongitudeDeg"], target["latitudeDeg"])
                if cover is None:
                    located.append({**target, "outside": True})
                else:
                    located.append({**target, "outside": False, **cover})
        except Exception as exc:
            blockers.append(f"SomBench south-pole tiles could not be read: {exc}")
            traceback.print_exc()

    usable = [item for item in located if not item.get("outside")]
    # One forward pass, batched across the distinct tiles that cover the sites.
    patch_keys: list[tuple[int, int]] = []
    for item in usable:
        key = (int(item["row"]), int(item["col"]))
        if key not in patch_keys:
            patch_keys.append(key)

    predictions: dict[tuple[int, int], object] = {}
    label_means: dict[tuple[int, int], float | None] = {}
    retrieved = None
    if patch_keys and not blockers:
        try:
            folders = [ensure_patch_layers(*key) for key in patch_keys]
            task = load_task(REPO, RAW / "backbone" / "config.yaml", RAW / CKPT_NAME)
            batch = predict_batch(task, folders)
            for key, (array, label_mean) in zip(patch_keys, batch, strict=True):
                predictions[key] = array
                label_means[key] = label_mean
            retrieved = utc_now()
            print(f"one forward pass scored {len(patch_keys)} patch(es)")
        except Exception as exc:
            blockers.append(f"torch/terratorch inference failed: {exc}")
            traceback.print_exc()

    contexts: dict[str, dict] = {}
    log = {
        "retrievedAtUtc": retrieved,
        "targetNote": target_note,
        "blockers": blockers,
        "patches": [f"patch_{row:04d}_{col:04d}_S_80S" for row, col in patch_keys],
        "sites": [],
    }

    if not located and not contexts:
        statement = (
            "No prospectivity number is available. Missing piece: "
            + ("; ".join(blockers) if blockers else "south-pole SomBench tile")
            + "."
        )
        contexts[FALLBACK_SITE] = blank_context(
            FALLBACK_SITE,
            "insufficient_data",
            statement,
            "South-polar SomBench extent was not read. No numeric prospectivity was invented.",
        )

    for item in located:
        site_id = item["id"]
        if item.get("outside"):
            contexts[site_id] = blank_context(
                site_id,
                "outside_extent",
                (
                    f"No SomBench south-pole tile covers latitude {item['latitudeDeg']}°, "
                    f"east longitude {item['eastLongitudeDeg']}°. "
                    "The ice-prospectivity model is only defined within 10° of a pole. "
                    "No prospectivity number is available."
                ),
                "Outside the south-polar tiles shipped with SomBench Ice Prospectivity.",
            )
            continue
        key = (int(item["row"]), int(item["col"]))
        prediction = predictions.get(key)
        label_mean = label_means.get(key)
        if prediction is None:
            missing = "; ".join(blockers) if blockers else "the forward pass did not return this tile"
            contexts[site_id] = blank_context(
                site_id,
                "insufficient_data",
                f"No prospectivity number is available. Missing piece: {missing}.",
                f"Requested {item['eastLongitudeDeg']}° E, {item['latitudeDeg']}°. {target_note}.",
            )
            continue
        import numpy as np

        patch_mean = float(np.mean(prediction))
        value = neighbourhood_mean(prediction, item["pixel_row"], item["pixel_col"])
        center_x, center_y = pixel_center(
            read_tiff(SOMBENCH / patch_name(item["row"], item["col"], "SLOPE")),
            item["pixel_col"],
            item["pixel_row"],
        )
        center_lon, center_lat = inverse_project(center_x, center_y)
        log["sites"].append(
            {
                "siteId": site_id,
                "value": value,
                "patchMean": patch_mean,
                "labelPatchMean": label_mean,
                "pixel": [item["pixel_row"], item["pixel_col"]],
                "centerLon": center_lon,
                "centerLat": center_lat,
                "patch": f"patch_{item['row']:04d}_{item['col']:04d}_S_80S",
            }
        )
        gap = None if label_mean is None else abs(patch_mean - label_mean)
        if gap is not None and gap > 0.15:
            contexts[site_id] = blank_context(
                site_id,
                "insufficient_data",
                (
                    "A forward pass ran, but the predicted patch mean disagreed with the "
                    f"Coyan et al. target patch mean by {gap:.3f}, far outside the reported "
                    "test RMSE of about 0.029. The number was withheld rather than published "
                    "as prospectivity. No prospectivity number is available."
                ),
                (
                    f"Pixel centre used: {center_lon:.5f}° E, {center_lat:.5f}°. "
                    f"Patch patch_{item['row']:04d}_{item['col']:04d}_S_80S, "
                    f"row {item['pixel_row']}, col {item['pixel_col']}."
                ),
            )
            continue
        if not (0.0 <= value <= 1.0 and 0.0 <= patch_mean <= 1.0):
            contexts[site_id] = blank_context(
                site_id,
                "insufficient_data",
                (
                    "The model returned a neighbourhood or patch mean outside 0–1. "
                    "That number was not stored. No prospectivity number is available."
                ),
                (
                    f"Pixel centre used: {center_lon:.5f}° E, {center_lat:.5f}°. "
                    f"Raw neighbourhood mean {value:.6f}, raw patch mean {patch_mean:.6f}."
                ),
            )
            continue
        contexts[site_id] = {
            "status": "ready",
            "modelId": MODEL_ID,
            "checkpoint": CHECKPOINT,
            "license": "Apache-2.0",
            "task": "polar_ice_prospectivity_regression",
            "siteId": site_id,
            "value": value,
            "patchMean": patch_mean,
            "resolutionM": 240,
            "extentNote": (
                f"Neighbourhood within one pixel of row {item['pixel_row']}, col {item['pixel_col']} "
                f"of patch_{item['row']:04d}_{item['col']:04d}_S_80S. "
                f"Pixel centre {center_lon:.5f}° E, {center_lat:.5f}° "
                f"(requested {item['eastLongitudeDeg']}° E, {item['latitudeDeg']}°). "
                f"GeoTIFF spacing {item['scale_m']:.2f} m; the model card states 240 m/px. "
                "South pole only, within the SomBench 80S stack."
            ),
            "retrievedAtUtc": retrieved,
            "sourceUrls": SOURCE_URLS,
            "limitations": LIMITATIONS,
            "statement": (
                f"Mean model prospectivity within one pixel of the site is {value:.6f}. "
                f"The 256×256 patch mean is {patch_mean:.6f}. "
                "This regresses the Coyan et al. (2025) fuzzy-overlay map. It is not measured ice, "
                "and it does not affect Sun or Earth visibility."
            ),
        }

    if not contexts:
        contexts[FALLBACK_SITE] = blank_context(
            FALLBACK_SITE,
            "insufficient_data",
            "No prospectivity number is available. Missing piece: "
            + ("; ".join(blockers) if blockers else "unknown"),
            "No site was scored.",
        )

    RAW.mkdir(parents=True, exist_ok=True)
    LOG_PATH.write_text(json.dumps(log, indent=2) + "\n")
    write_fixture(contexts)
    print(json.dumps({"blockers": blockers, "sites": list(contexts)}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        statement = (
            "No prospectivity number is available. Missing piece: "
            + traceback.format_exc().strip().splitlines()[-1]
        )
        write_fixture(
            {
                FALLBACK_SITE: blank_context(
                    FALLBACK_SITE,
                    "insufficient_data",
                    statement,
                    "The fetch script failed before a model output was accepted.",
                )
            }
        )
        raise SystemExit(1)
