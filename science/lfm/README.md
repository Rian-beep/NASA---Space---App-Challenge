# Lunar Foundation Model fetch

This folder documents the auxiliary ice-prospectivity fetch. Weights are not stored here.

The script is `science/scripts/fetch_lfm.py`. From the repository root:

```bash
python3 science/scripts/fetch_lfm.py
```

or, after dependencies are installed in the app:

```bash
npm run lfm:fetch
```

## What it downloads

Into `data/raw/lfm/` (gitignored):

- `config.yaml` and `ni_lfm_ps8_all_modalities_s42.ckpt` from [Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model](https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model). The checkpoint is about 1.69 GB. Full fine-tuning is self-contained, so the pretrained backbone weights are not required.
- `backbone/config.yaml` (about 12 KB) from the foundation-model repo. The network constructor needs this pretraining modality config. It is not a weight file.
- A shallow clone of [NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model](https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model) at `data/raw/lfm/repo`.
- South-pole GeoTIFFs from [Sombench-Ice-Prospectivity-Regression](https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression), only for the patch that is actually scored.

## What it refuses

- The base tokenizer bundle (about 12 GB) under `tokenizers/` on the foundation-model repo.
- `backbone/checkpoint.pt` (the pretrained encoder, about 2.4 GB).
- Any numeric prospectivity that did not come from a successful forward pass of `ni_lfm_ps8_all_modalities_s42.ckpt`.

## Inference

If `src/lib/science/fixtures` contains sites at latitude ≤ −80°, the script loads the checkpoint once and runs one batched forward pass on the distinct south-pole patches that contain those sites. Each site value is the 3×3 neighbourhood around the pixel that contains the site. If those fixtures are not present, it scores the south-pole pixel nearest 0° E, 89.5° S and records the pixel-centre coordinate it actually used.

The output file is `src/lib/lfm/fixtures/contexts.json`. When torch, TerraTorch, or the dataset cannot be used, that file is written with `status: "insufficient_data"` and a statement that names the missing piece. The value stays `null`.

A CPU virtualenv is created at `data/raw/lfm/.venv` on the first successful install. That directory is gitignored with the rest of `data/raw/`.
