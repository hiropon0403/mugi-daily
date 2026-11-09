// むーちゃん日替わり + AUD/JPY ウィジェット (Scriptable)
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

async function fetchTheme() {
  try {
    const req = new Request(`${RAW}/today.json?d=${todayStr()}`);
    return await req.loadJSON();
  } catch (e) {
    return null;
  }
}

async function fetchMugiImage() {
  try {
    const req = new Request(`${RAW}/today.b64?d=${todayStr()}`);
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
  const w = 300, h = 64;
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = false;
  ctx.setStrokeColor(up ? Color.green() : Color.red());
  ctx.setLineWidth(3);
  if (closes.length < 2) return ctx.getImage();
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const path = new Path();
  closes.forEach((v, i) => {
    const x = (i / (closes.length - 1)) * (w - 8) + 4;
    const y = h - 6 - ((v - min) / span) * (h - 12);
    if (i === 0) path.move(new Point(x, y));
    else path.addLine(new Point(x, y));
  });
  ctx.addPath(path);
  ctx.strokePath();
  return ctx.getImage();
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = Color.dynamic(Color.white(), Color.black());
  widget.setPadding(10, 12, 10, 12);

  const [theme, mugiImg, rate] = await Promise.all([
    fetchTheme(),
    fetchMugiImage(),
    fetchRate().catch(() => null),
  ]);

  // 上段: むーちゃん + 通貨ペア名 + 変化率
  const top = widget.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  if (mugiImg) {
    const im = top.addImage(mugiImg);
    im.imageSize = new Size(52, 52);
    im.cornerRadius = 10;
    top.addSpacer(8);
  }

  const head = top.addStack();
  head.layoutVertically();
  const pairRow = head.addStack();
  pairRow.layoutHorizontally();
  const pair = pairRow.addText(LABEL);
  pair.font = Font.boldSystemFont(13);
  pairRow.addSpacer(6);

  let up = true;
  if (rate) {
    const diff = rate.price - rate.prev;
    up = diff >= 0;
    const pct = (diff / rate.prev) * 100;
    const chg = pairRow.addText(`${up ? "+" : ""}${pct.toFixed(2)}%`);
    chg.font = Font.boldSystemFont(12);
    chg.textColor = up ? Color.green() : Color.red();

    const price = head.addText(rate.price.toFixed(2));
    price.font = Font.boldSystemFont(26);
  } else {
    const na = head.addText("取得失敗");
    na.font = Font.systemFont(13);
    na.textColor = Color.gray();
  }

  widget.addSpacer(4);

  // 中段: ミニチャート
  if (rate && rate.closes.length > 1) {
    const chart = widget.addImage(drawChart(rate.closes, up));
    chart.imageSize = new Size(150, 32);
  }

  widget.addSpacer();

  // 下段: 今日のテーマ
  if (theme && theme.anniversary) {
    const t = widget.addText(`今日は${theme.anniversary}の日`);
    t.font = Font.systemFont(10);
    t.textColor = Color.gray();
    t.lineLimit = 1;
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
