// 把 Natural Earth（公有領域，https://www.naturalearthdata.com/）的 50m 陸地、湖、河流
// 轉成後端讀的精簡格式，放在 backend/data/geo/。航行日誌的地面照站長填的發射台位置，
// 由後端從這三份裁出那一塊（backend/src/ground.rs）。
//
// 格式：座標×100 取整（0.01° 約 1 公里，畫面上看不出差別）
//   land.json、lakes.json：[塊][環][經度, 緯度, 經度, 緯度, …]，每個環不重複最後一點
//   rivers.json：[線][經度, 緯度, …]
//
// 用法（資料很少變，產一次提交進 repo 就好）：
//   curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
//   curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
//   curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson
//   node scripts/geo/natural-earth.ts <放那三個檔的資料夾>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('用法：node scripts/geo/natural-earth.ts <geojson 資料夾>');
const out = new URL('../../backend/data/geo/', import.meta.url);

type Pos = [number, number];
/** 只讀得到 Polygon／MultiPolygon（陸地、湖）或 LineString／MultiLineString（河流） */
type Geometry =
  | { type: 'Polygon'; coordinates: Pos[][] }
  | { type: 'MultiPolygon'; coordinates: Pos[][][] }
  | { type: 'LineString'; coordinates: Pos[] }
  | { type: 'MultiLineString'; coordinates: Pos[][] };

const flat = (pts: Pos[]) => pts.flatMap(([x, y]) => [Math.round(x * 100), Math.round(y * 100)]);
const geometries = (name: string): Geometry[] =>
  (
    JSON.parse(readFileSync(join(dir, `${name}.geojson`), 'utf8')) as {
      features: { geometry: Geometry | null }[];
    }
  ).features.flatMap((f) => (f.geometry ? [f.geometry] : []));

function polygons(name: string) {
  const all: number[][][] = [];
  for (const g of geometries(name)) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      // GeoJSON 的環最後一點跟第一點一樣，去掉
      const rings = poly.map((r) => flat(r.slice(0, -1))).filter((r) => r.length >= 6);
      if (rings.length) all.push(rings);
    }
  }
  return all;
}

function lines(name: string) {
  const all: number[][] = [];
  for (const g of geometries(name)) {
    const list = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of list) {
      const pts = flat(line);
      if (pts.length >= 4) all.push(pts);
    }
  }
  return all;
}

writeFileSync(new URL('land.json', out), JSON.stringify(polygons('ne_50m_land')));
writeFileSync(new URL('lakes.json', out), JSON.stringify(polygons('ne_50m_lakes')));
writeFileSync(new URL('rivers.json', out), JSON.stringify(lines('ne_50m_rivers_lake_centerlines')));
console.log('wrote backend/data/geo/{land,lakes,rivers}.json');
