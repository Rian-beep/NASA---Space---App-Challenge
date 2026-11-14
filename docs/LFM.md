# NASA-IBM Lunar Foundation Model in Lunar Window

Lunar Window uses one downstream checkpoint of the NASA-IBM Lunar Foundation Model as an auxiliary surface-context layer. It does not feed Sun or Earth visibility, and it does not replace JPL Horizons or a LOLA horizon.

## What we use

| Piece | Source |
| --- | --- |
| Foundation model | [nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model](https://huggingface.co/nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model), Apache-2.0 |
| Checkpoint actually run | [Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model](https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model) file `ni_lfm_ps8_all_modalities_s42.ckpt`, with that repo's `config.yaml` |
| Code | [NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model](https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model) |
| Inputs | SomBench ice-prospectivity stack, [Sombench-Ice-Prospectivity-Regression](https://huggingface.co/datasets/nasa-ibm-ai4science/Sombench-Ice-Prospectivity-Regression) |

The task is dense regression on 256×256 px patches at 240 m/px, within 10° of each pole. The nine input channels are aspect (sine and cosine), CUR, DICE, LPSR, LPSR_DEN, LPSR_DIS, slope, and TMAX. The training target is the Coyan et al. (2025) knowledge-driven fuzzy-overlay ice prospectivity map. The model card reports test RMSE about 0.029 on that map (0.0293 ± 0.0013).

The released ice checkpoint is a full fine-tune, so inference does not need the pretrained backbone weights. We still read the small pretraining `backbone/config.yaml` (about 12 KB) because the architecture constructor requires its modality table. We do not download the tokenizer bundle.

App code lives in `src/lib/lfm/` and `src/components/lfm/`. Stored site context, when a real forward pass has succeeded, is `src/lib/lfm/fixtures/contexts.json`. A missing site, a missing file, or a number outside 0–1 is returned as `insufficient_data` with a null value.

## What we refuse to claim

- The output is not measured ice and not a picture of ice.
- It is not a resource estimate and not evidence that ice is present.
- It is not validated for landing-site certification, ISRU, or hazard clearance.
- The backbone maintains no geodetic frame. A coordinate attached to a stored value is the SomBench pixel we scored, not a geodetic product of the network.
- The model is polar only. Sites outside that extent are `outside_extent` and have no number.
- These outputs must never replace JPL Horizons or LOLA horizon visibility. They do not change Sun or Earth visibility in this app.
- We do not invent a prospectivity number when the checkpoint, the dataset, or the runtime is missing.

## Reproduce the fetch

From the repository root:

```bash
python3 science/scripts/fetch_lfm.py
```

`npm run lfm:fetch` calls the same script. Details and the refusal list are in `science/lfm/README.md`.

The script writes only real model outputs into `src/lib/lfm/fixtures/contexts.json`. Checkpoint weights stay under `data/raw/lfm/` and are gitignored. Do not commit them.

## Citations

NASA, “Artificial Intelligence Lunar Foundation Model,” 10 September 2026.  
https://science.nasa.gov/science-research/artificial-intelligence-lunar-foundation-model/

Fraccaro, Paolo, et al. “Multimodal-Multiresolution Foundation Model for Lunar Remote Sensing,” 2026. Model card: https://huggingface.co/nasa-ibm-ai4science/NASA-IBM-Lunar-Foundation-Model

NASA-IBM AI4Science. “Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model,” 2026. https://huggingface.co/nasa-ibm-ai4science/Ice-Prospectivity-NASA-IBM-Lunar-Foundation-Model

Coyan, Jessica A., et al. “Prospectivity mapping for lunar polar water ice,” 2025. The regression target, not a measurement.

Patil, Himanshu, et al. “SomBench: Benchmark Dataset for Advancing Machine Learning in Lunar Science,” 2026. https://huggingface.co/collections/nasa-ibm-ai4science/lunar-fm-ml-ready-benchmark-dataset-sombench

Code: https://github.com/NASA-IMPACT/NASA-IBM-Lunar-Foundation-Model (Apache-2.0).

Also cite TerraTorch, TerraMind, and FlexiViT when comparing the training method, as the model card requests. LOLA and Diviner products underlie the SomBench layers.
