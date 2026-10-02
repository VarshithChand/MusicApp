# Optional: train a real classifier

**Status: written, NOT run.** There is no labelled, licensed dataset in this project, so no model has been trained and no accuracy is claimed. The app works without this folder (it uses the rule-based `heuristic-v1` classifier).

## What you need first

Audio you have the right to use for training (your own uploads, Creative Commons tracks, or licensed data), labelled by a person. Do not train on unlicensed music, and do not use file names as labels.

Create `manifest.csv`:

```
path,labels,split
data/song1.mp3,melody;romantic,train
data/song2.mp3,mass;energetic,val
data/song3.mp3,dj-remix;dance,test
```

Labels are slugs from `backend/src/labels.ts`, separated by `;`. `split` is `train`, `val` or `test`.

## Run

```
pip install librosa scikit-learn numpy joblib
python train.py manifest.csv --out model.joblib
```

It reports, on the held-out test split, precision / recall / F1 per label and a confusion matrix for the style labels.

## Use it in the app

Serve the model behind a small HTTP service that implements the contract in `docs/CLASSIFICATION.md` (`POST /classify`), then set `CLASSIFIER_URL` (and optionally `CLASSIFIER_API_KEY`) on the backend. Admins still review and approve every label.
