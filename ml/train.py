"""Train and evaluate a multi-label song classifier from a labelled manifest.

NOT RUN in this project: there is no licensed, labelled dataset. See README.md.
Usage: python train.py manifest.csv --out model.joblib
"""
import argparse
import csv
import sys

import joblib
import librosa
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.multiclass import OneVsRestClassifier
from sklearn.preprocessing import MultiLabelBinarizer

STYLE = ["melody", "dj-remix", "mass", "energetic", "dance"]


def features(path):
    y, sr = librosa.load(path, sr=11025, mono=True, duration=75)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    return np.concatenate([
        [float(np.atleast_1d(tempo)[0])],
        [librosa.feature.rms(y=y).mean(), librosa.feature.spectral_centroid(y=y, sr=sr).mean()],
        [librosa.onset.onset_strength(y=y, sr=sr).mean()],
        mfcc.mean(axis=1), mfcc.std(axis=1),
    ])


def load(rows):
    X = np.array([features(r["path"]) for r in rows])
    Y = [[l for l in r["labels"].split(";") if l] for r in rows]
    return X, Y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest")
    ap.add_argument("--out", default="model.joblib")
    args = ap.parse_args()

    with open(args.manifest, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    split = {s: [r for r in rows if r["split"] == s] for s in ("train", "val", "test")}
    if not split["train"] or not split["test"]:
        sys.exit("manifest needs both train and test rows")

    Xtr, Ytr = load(split["train"])
    mlb = MultiLabelBinarizer().fit(Ytr)
    model = OneVsRestClassifier(RandomForestClassifier(n_estimators=200, class_weight="balanced", random_state=0))
    model.fit(Xtr, mlb.transform(Ytr))

    for name in ("val", "test"):
        if not split[name]:
            continue
        X, Y = load(split[name])
        T = mlb.transform(Y)
        P = model.predict(X)
        print(f"\n=== {name} ({len(X)} songs) ===")
        print(classification_report(T, P, target_names=mlb.classes_, zero_division=0))
        if name == "test":
            idx = [i for i, c in enumerate(mlb.classes_) if c in STYLE]
            for i in idx:
                print(f"confusion [{mlb.classes_[i]}] (rows=true, cols=pred):\n{confusion_matrix(T[:, i], P[:, i])}")

    joblib.dump({"model": model, "labels": list(mlb.classes_)}, args.out)
    print(f"\nsaved {args.out}")


if __name__ == "__main__":
    main()
