// むーちゃん日替わり + AUD/JPY ウィジェット (Scriptable) v3
// その日のテーマ背景を画面いっぱいに敷き、むーちゃんを手前に重ね、
// さらに手前にレートとグラフを合成する
// 画像とテーマ: GitHub hiropon0403/mugi-daily（毎朝5時に むーちゃん が更新）
// レート: Yahoo Finance 公開チャートAPIから iPhone 自身が取得
// 注意: ウィジェットの更新間隔は iOS が決めます（目安15分〜1時間）

const RAW = "https://raw.githubusercontent.com/hiropon0403/mugi-daily/main";
const SYMBOL = "AUDJPY=X";
const LABEL = "AUD/JPY";

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function fetchJSONFile(name) {
  try {
    const req = new Request(`${RAW}/${name}?d=${todayStr()}`);
    return await req.loadJSON();
  } catch (e) {
    return null;
  }
}

async function fetchB64Image(name) {
  try {
    const req = new Request(`${RAW}/${name}?d=${todayStr()}`);
    const b64 = (await req.loadString()).trim();
    const data = Data.fromBase64String(b64);
    return data ? Image.fromData(data) : null;
  } catch (e) {
    return null;
  }
}

async function fetchRate() {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(SYMBOL)}?interval=15m&range=1d`;
  const req = new Request(url);
  req.headers = { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" };
  const json = await req.loadJSON();
  const r = json.chart.result[0];
  const price = r.meta.regularMarketPrice;
  const prev = r.meta.chartPreviousClose;
  const closes = (r.indicators.quote[0].close || []).filter((v) => v != null);
  return { price, prev, closes };
}

function drawChart(closes, up) {
  const w = 200, h = 64;
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((v, i) => new Point(
    (i / (closes.length - 1)) * (w - 8) + 4,
    h - 6 - ((v - min) / span) * (h - 12)
  ));
  const fill = new Path();
  fill.move(pts[0]);
  pts.forEach((p) => fill.addLine(p));
  fill.addLine(new Point(pts[pts.length - 1].x, h));
  fill.addLine(new Point(pts[0].x, h));
  fill.closeSubpath();
  ctx.addPath(fill);
  ctx.setFillColor(new Color(up ? "#22c55e" : "#ef4444", 0.30));
  ctx.fillPath();
  const line = new Path();
  line.move(pts[0]);
  pts.forEach((p) => line.addLine(p));
  ctx.addPath(line);
  ctx.setStrokeColor(up ? Color.green() : Color.red());
  ctx.setLineWidth(3);
  ctx.strokePath();
  return ctx.getImage();
}

function panel(stack, alpha) {
  stack.backgroundColor = new Color("#000000", alpha);
  stack.cornerRadius = 8;
  stack.setPadding(5, 8, 5, 8);
  return stack;
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.setPadding(8, 8, 8, 8);

  const [theme, mugiImg, bgImg, rate] = await Promise.all([
    fetchJSONFile("today.json"),
    fetchB64Image("today.b64"),
    fetchB64Image("bg.b64"),
    fetchRate().catch(() => null),
  ]);

  // 背景: その日のテーマ背景。無ければ むーちゃん全面にフォールバック
  const hasBg = !!bgImg;
  if (hasBg) {
    widget.backgroundImage = bgImg;
  } else if (mugiImg) {
    widget.backgroundImage = mugiImg;
  } else {
    widget.backgroundColor = Color.dynamic(Color.white(), Color.black());
  }

  // 上部パネル: ペア名 + 変化率 + レート
  const headBox = widget.addStack();
  headBox.layoutVertically();
  panel(headBox, 0.45);

  const pairRow = headBox.addStack();
  pairRow.layoutHorizontally();
  const pair = pairRow.addText(LABEL);
  pair.font = Font.boldSystemFont(12);
  pair.textColor = Color.white();
  pairRow.addSpacer(6);

  let up = true;
  if (rate) {
    const diff = rate.price - rate.prev;
    up = diff >= 0;
    const pct = (diff / rate.prev) * 100;
    const chg = pairRow.addText(`${up ? "+" : ""}${pct.toFixed(2)}%`);
    chg.font = Font.boldSystemFont(12);
    chg.textColor = up ? new Color("#4ade80", 1) : new Color("#f87171", 1);

    const price = headBox.addText(rate.price.toFixed(2));
    price.font = Font.boldSystemFont(24);
    price.textColor = Color.white();
  } else {
    const na = headBox.addText("取得失敗");
    na.font = Font.systemFont(12);
    na.textColor = Color.white();
  }

  widget.addSpacer();

  // 下部: 左にグラフ+テーマ、右に むーちゃん（背景があるときだけカード表示）
  const bottom = widget.addStack();
  bottom.layoutHorizontally();
  bottom.bottomAlignContent();

  const leftCol = bottom.addStack();
  leftCol.layoutVertically();
  if (rate && rate.closes.length > 1) {
    const chart = leftCol.addImage(drawChart(rate.closes, up));
    chart.imageSize = new Size(100, 32);
    leftCol.addSpacer(3);
  }
  if (theme && theme.anniversary) {
    const footBox = leftCol.addStack();
    panel(footBox, 0.45);
    const t = footBox.addText(`今日は${theme.anniversary}の日`);
    t.font = Font.systemFont(9);
    t.textColor = Color.white();
    t.lineLimit = 1;
  }

  if (hasBg && mugiImg) {
    bottom.addSpacer();
    const card = bottom.addImage(mugiImg);
    card.imageSize = new Size(64, 64);
    card.cornerRadius = 12;
  }

  const next = new Date(Date.now() + 15 * 60 * 1000);
  widget.refreshAfterDate = next;
  return widget;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
