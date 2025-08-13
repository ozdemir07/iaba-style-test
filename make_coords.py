# reads files.txt (paths to thumbnails), computes simple features, runs UMAP → coords.csv
import numpy as np, csv, sys
from PIL import Image
from skimage import color, feature
from umap import UMAP

files = [p.strip() for p in open("files.txt","r",encoding="utf-8").read().splitlines() if p.strip()]
X=[]
for p in files:
    im = Image.open(p).convert("RGB").resize((128,128))
    arr = np.asarray(im)/255.0
    lab = color.rgb2lab(arr)
    hist,_ = np.histogram(lab[...,0], bins=16, range=(0,100), density=True)
    edges = feature.canny(color.rgb2gray(arr), sigma=1.0).mean()
    X.append(np.concatenate([hist, [edges]], axis=0))
X = np.vstack(X).astype(np.float32)

xy = UMAP(n_neighbors=25, min_dist=0.12, metric="euclidean", random_state=42).fit_transform(X)
with open("coords.csv","w",newline="",encoding="utf-8") as f:
    w=csv.writer(f); w.writerow(["index","x","y"])
    for i,(x,y) in enumerate(xy):
        w.writerow([i, float(x), float(y)])
print("Wrote coords.csv")
