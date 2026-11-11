// むーちゃん日替わり + AUD/JPY ウィジェット (Scriptable) v7.4
// v7.4: 造園の暗記ひとことと問題は、読み込みのたびにその日の複数問からランダムで変わる
// その日のテーマ背景の上に、むーちゃんを大きく合成（透過つきポーズ）し、
// さらに手前にレートとグラフを重ねる。読み込みごとにポーズがランダムに変わる。
// v7: 右上に今日の天気（Open-Meteo、佐賀固定）、下部に造園1級の暗記ひとことを表示。
// タップすると、先頭に造園の過去問1問（タップで即・正誤と根拠を表示）、
// その下にムービーと AUD/JPY の現在値を全画面表示し、閉じると Muse を開く。
// 画像とテーマ: GitHub hiropon0403/mugi-daily（毎朝5時に むーちゃん が更新）
// 造園データ: zouen.json（毎朝5:30の造園準備が mugi-daily に追加。日付が当日のものだけ表示）
// レート: Yahoo Finance 公開チャートAPIから iPhone 自身が取得
// 注意: ウィジェットの更新間隔は iOS が決めます（目安15分〜1時間）

const RAW = "https://raw.githubusercontent.com/hiropon0403/mugi-daily/main";
const SYMBOL = "AUDJPY=X";
const LABEL = "AUD/JPY";
// 天気は佐賀市固定（Open-Meteo、APIキー不要）
const WX_LAT = 33.2635;
const WX_LON = 130.3009;

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function fetchJSONFile(name) {
  try {
    const req = new Request(`${RAW}/${name}?d=${todayStr()}`);
    return await req.loadJSON();
  } catch (e) {
    return null;
  }
}

async function fetchB64Text(name) {
  try {
    const req = new Request(`${RAW}/${name}?d=${todayStr()}`);
    return (await req.loadString()).trim();
  } catch (e) {
    return null;
  }
}

async function fetchB64Image(name) {
  const b64 = await fetchB64Text(name);
  if (!b64) return null;
  const data = Data.fromBase64String(b64);
  return data ? Image.fromData(data) : null;
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

// WMO天気コード → 絵文字と日本語ラベル
function wxIcon(code) {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}

async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${WX_LAT}&longitude=${WX_LON}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FTokyo&forecast_days=1`;
  const req = new Request(url);
  const json = await req.loadJSON();
  const cur = json.current;
  const day = json.daily;
  return {
    icon: wxIcon(cur.weather_code),
    temp: Math.round(cur.temperature_2m),
    max: Math.round(day.temperature_2m_max[0]),
    min: Math.round(day.temperature_2m_min[0]),
    rain: day.precipitation_probability_max ? day.precipitation_probability_max[0] : null,
  };
}

// 造園データは日付が当日のものだけ有効とする。
// zouen.json の items（その日の複数問）から、読み込みのたびにランダムで1問選ぶ。
// 旧形式（単一の question を直接持つ形）も1問として扱う。
async function fetchZouen() {
  const z = await fetchJSONFile("zouen.json");
  if (!z || z.date !== todayISO()) return null;
  const items = Array.isArray(z.items) && z.items.length ? z.items : (z.question ? [z] : []);
  const valid = items.filter((it) => it && it.question);
  if (!valid.length) return null;
  return valid[Math.floor(Math.random() * valid.length)];
}

// ctx の rect 内にチャートを描く
function drawChartIn(ctx, closes, up, rect) {
  if (!closes || closes.length < 2) return;
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((v, i) => new Point(
    rect.x + (i / (closes.length - 1)) * rect.w,
    rect.y + rect.h - ((v - min) / span) * rect.h
  ));
  const fill = new Path();
  fill.move(pts[0]);
  pts.forEach((p) => fill.addLine(p));
  fill.addLine(new Point(pts[pts.length - 1].x, rect.y + rect.h));
  fill.addLine(new Point(pts[0].x, rect.y + rect.h));
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
}

// 背景 + 大きな むーちゃん + チャート を1枚に合成する
function composeImage(bgImg, poseImg, rate, up) {
  const S = 340;
  const ctx = new DrawContext();
  ctx.size = new Size(S, S);
  ctx.opaque = true;
  if (bgImg) {
    ctx.drawImageInRect(bgImg, new Rect(0, 0, S, S));
  } else {
    ctx.setFillColor(Color.white());
    ctx.fillRect(new Rect(0, 0, S, S));
  }
  if (poseImg) {
    ctx.drawImageInRect(poseImg, new Rect(58, 38, 288, 288));
  }
  if (rate) {
    drawChartIn(ctx, rate.closes, up, new Rect(10, 228, 140, 54));
  }
  return ctx.getImage();
}

// 中サイズ用: 横長キャンバスに背景 + 右寄りの むーちゃん を合成する
function composeMediumImage(bgImg, poseImg) {
  const ctx = new DrawContext();
  ctx.size = new Size(676, 316);
  ctx.opaque = true;
  if (bgImg) {
    ctx.drawImageInRect(bgImg, new Rect(0, 0, 676, 316));
  } else {
    ctx.setFillColor(Color.white());
    ctx.fillRect(new Rect(0, 0, 676, 316));
  }
  if (poseImg) {
    ctx.drawImageInRect(poseImg, new Rect(200, 0, 310, 316));
  }
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

  const theme = await fetchJSONFile("today.json");
  const poseCount = theme && theme.poses ? theme.poses : 1;
  const poseIdx = 1 + Math.floor(Math.random() * poseCount);
  const [poseImg, todayImg, bgImg, rate, weather, zouen] = await Promise.all([
    fetchB64Image(`pose${poseIdx}.b64`),
    fetchB64Image("today.b64"),
    fetchB64Image("bg.b64"),
    fetchRate().catch(() => null),
    fetchWeather().catch(() => null),
    fetchZouen().catch(() => null),
  ]);

  let up = true;
  if (rate) up = rate.price - rate.prev >= 0;

  const isMedium = config.widgetFamily === "systemMedium";

  // 合成画像を背景に敷く（ポーズが無い日は従来どおり全面表示にフォールバック）
  if (isMedium && bgImg && poseImg) {
    widget.backgroundImage = composeMediumImage(bgImg, poseImg);
  } else if (bgImg && poseImg) {
    widget.backgroundImage = composeImage(bgImg, poseImg, rate, up);
  } else if (todayImg) {
    widget.backgroundImage = todayImg;
  } else if (bgImg) {
    widget.backgroundImage = bgImg;
  } else {
    widget.backgroundColor = Color.dynamic(Color.white(), Color.black());
  }

  // ---- 中サイズ: 文字を約2倍にしたレイアウト（テーマ行は省略、タップページで表示） ----
  if (isMedium) {
    const mTop = widget.addStack();
    mTop.layoutHorizontally();
    const mHead = mTop.addStack();
    mHead.layoutVertically();
    panel(mHead, 0.45);
    const mPairRow = mHead.addStack();
    mPairRow.layoutHorizontally();
    const mPair = mPairRow.addText(LABEL);
    mPair.font = Font.boldSystemFont(20);
    mPair.textColor = Color.white();
    mPairRow.addSpacer(8);
    if (rate) {
      const diff = rate.price - rate.prev;
      const pct = (diff / rate.prev) * 100;
      const mChg = mPairRow.addText(`${up ? "+" : ""}${pct.toFixed(2)}%`);
      mChg.font = Font.boldSystemFont(20);
      mChg.textColor = up ? new Color("#4ade80", 1) : new Color("#f87171", 1);
      const mPrice = mHead.addText(rate.price.toFixed(2));
      mPrice.font = Font.boldSystemFont(46);
      mPrice.textColor = Color.white();
    } else {
      const mNa = mHead.addText("取得失敗");
      mNa.font = Font.systemFont(16);
      mNa.textColor = Color.white();
    }
    mTop.addSpacer();
    if (weather) {
      const mWx = mTop.addStack();
      mWx.layoutVertically();
      panel(mWx, 0.45);
      const mWxTop = mWx.addStack();
      mWxTop.layoutHorizontally();
      const mIcon = mWxTop.addText(weather.icon);
      mIcon.font = Font.systemFont(30);
      mWxTop.addSpacer(4);
      const mTemp = mWxTop.addText(`${weather.temp}°`);
      mTemp.font = Font.boldSystemFont(30);
      mTemp.textColor = Color.white();
      const mSub = mWx.addText(`${weather.max}° / ${weather.min}°${weather.rain != null ? ` ・ ☔${weather.rain}%` : ""}`);
      mSub.font = Font.systemFont(14);
      mSub.textColor = Color.white();
    }
    widget.addSpacer();
    if (zouen && zouen.hitokoto) {
      const mFootRow = widget.addStack();
      mFootRow.layoutHorizontally();
      const mFoot = mFootRow.addStack();
      panel(mFoot, 0.45);
      const mh = mFoot.addText(`🌱暗記：${zouen.hitokoto}`);
      mh.font = Font.boldSystemFont(22);
      mh.textColor = new Color("#fef08a", 1);
      mh.lineLimit = 2;
    }
    const mNext = new Date(Date.now() + 15 * 60 * 1000);
    widget.refreshAfterDate = mNext;
    return widget;
  }

  // 上部: 左にペア名 + 変化率 + レート、右上に天気
  const topRow = widget.addStack();
  topRow.layoutHorizontally();
  const headBox = topRow.addStack();
  headBox.layoutVertically();
  panel(headBox, 0.45);

  const pairRow = headBox.addStack();
  pairRow.layoutHorizontally();
  const pair = pairRow.addText(LABEL);
  pair.font = Font.boldSystemFont(16);
  pair.textColor = Color.white();
  pairRow.addSpacer(6);

  if (rate) {
    const diff = rate.price - rate.prev;
    const pct = (diff / rate.prev) * 100;
    const chg = pairRow.addText(`${up ? "+" : ""}${pct.toFixed(2)}%`);
    chg.font = Font.boldSystemFont(16);
    chg.textColor = up ? new Color("#4ade80", 1) : new Color("#f87171", 1);

    const price = headBox.addText(rate.price.toFixed(2));
    price.font = Font.boldSystemFont(38);
    price.textColor = Color.white();
  } else {
    const na = headBox.addText("取得失敗");
    na.font = Font.systemFont(12);
    na.textColor = Color.white();
  }
  topRow.addSpacer();

  // 右上: 今日の天気（佐賀）
  if (weather) {
    const wxBox = topRow.addStack();
    wxBox.layoutVertically();
    panel(wxBox, 0.45);
    const wxTop = wxBox.addStack();
    wxTop.layoutHorizontally();
    const wxIconText = wxTop.addText(weather.icon);
    wxIconText.font = Font.systemFont(26);
    wxTop.addSpacer(4);
    const wxTemp = wxTop.addText(`${weather.temp}°`);
    wxTemp.font = Font.boldSystemFont(26);
    wxTemp.textColor = Color.white();
    const wxSub = wxBox.addText(`${weather.max}° / ${weather.min}°`);
    wxSub.font = Font.systemFont(12);
    wxSub.textColor = Color.white();
    if (weather.rain != null) {
      const wxRain = wxBox.addText(`☔${weather.rain}%`);
      wxRain.font = Font.systemFont(12);
      wxRain.textColor = Color.white();
    }
  }

  widget.addSpacer();

  // 下部: テーマ + 造園の暗記ひとこと
  if ((theme && theme.anniversary) || zouen) {
    const footRow = widget.addStack();
    footRow.layoutHorizontally();
    const footBox = footRow.addStack();
    footBox.layoutVertically();
    panel(footBox, zouen ? 0.62 : 0.45);
    if (theme && theme.anniversary) {
      const t = footBox.addText(`今日は${theme.anniversary}の日`);
      t.font = Font.systemFont(13);
      t.textColor = Color.white();
      t.lineLimit = 1;
    }
    if (zouen && zouen.hitokoto) {
      const h = footBox.addText(`🌱暗記：${zouen.hitokoto}`);
      h.font = Font.boldSystemFont(20);
      h.textColor = new Color("#fef08a", 1);
      h.lineLimit = 4;
    }
    footRow.addSpacer();
  }

  const next = new Date(Date.now() + 15 * 60 * 1000);
  widget.refreshAfterDate = next;
  return widget;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---- タップ時の全画面ページ（先頭に造園1問、その下に背景つきムービー + 現在値） ----
async function showTapPage(theme) {
  const [rate, movieB64, zouen] = await Promise.all([
    fetchRate().catch(() => null),
    fetchB64Text("movie.b64"),
    fetchZouen().catch(() => null),
  ]);

  // 造園クイズ（選択肢をタップすると即・正誤と根拠を表示）
  let quizHtml = "";
  if (zouen && zouen.question) {
    const q = zouen.question;
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const buttons = choices.map((c, i) =>
      `<button class="choice" id="c${i}" onclick="answer(${i})">${esc(c)}</button>`
    ).join("");
    const quizData = JSON.stringify({
      answerIndex: typeof q.answerIndex === "number" ? q.answerIndex : -1,
      answerText: q.answerText || "",
      explanation: q.explanation || "",
    }).replace(/</g, "\\u003c");
    quizHtml = `
  <section class="quiz">
    <div class="quiz-head">🌱 造園1級・今日の1問${zouen.field ? `（${esc(zouen.field)}）` : ""}</div>
    <div class="quiz-q">${esc(q.text)}</div>
    <div class="choices">${buttons}</div>
    <div class="result" id="result"></div>
  </section>
  <script>
    const Q = ${quizData};
    let done = false;
    function answer(i) {
      if (done) return;
      done = true;
      const ok = i === Q.answerIndex;
      for (let j = 0; j < ${choices.length}; j++) {
        const b = document.getElementById("c" + j);
        b.disabled = true;
        if (j === Q.answerIndex) b.classList.add("correct");
        else if (j === i) b.classList.add("wrong");
        else b.classList.add("dim");
      }
      const r = document.getElementById("result");
      r.innerHTML = "<div class='" + (ok ? "ok" : "ng") + "'>" +
        (ok ? "⭕ 正解！" : "❌ 不正解…") +
        " 正解は " + Q.answerText + "</div>" +
        (Q.explanation ? "<div class='expl'>" + Q.explanation + "</div>" : "");
      r.style.display = "block";
    }
  </script>`;
  }

  let priceHtml = "<div class='na'>レートを取得できませんでした</div>";
  if (rate) {
    const diff = rate.price - rate.prev;
    const up = diff >= 0;
    const pct = (diff / rate.prev) * 100;
    priceHtml = `
      <div class="pair">AUD/JPY <span class="${up ? "up" : "down"}">${up ? "+" : ""}${pct.toFixed(2)}%</span></div>
      <div class="price">${rate.price.toFixed(3)}</div>
      <div class="sub">前日終値 ${rate.prev.toFixed(3)} / 差 ${up ? "+" : ""}${diff.toFixed(3)}</div>`;
  }
  const themeText = theme && theme.anniversary
    ? `今日は${theme.anniversary}の日${theme.design ? `（${theme.design}）` : ""}`
    : "";
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}/${p(now.getMonth() + 1)}/${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; background:#1a1512; color:#fff; font-family:-apple-system, sans-serif; text-align:center; min-height:100vh; }
  .shade { min-height:100vh; padding:18px 14px 26px; box-sizing:border-box; }
  video { width:92%; max-height:58vh; object-fit:contain; background:#000; display:block; margin:6px auto 0;
    border-radius:18px; box-shadow:0 8px 30px rgba(0,0,0,0.45); }
  .pair { margin-top:16px; font-size:17px; font-weight:700; letter-spacing:.05em; }
  .up { color:#4ade80; } .down { color:#f87171; }
  .price { font-size:52px; font-weight:800; line-height:1.15; }
  .sub { color:#ddd; font-size:13px; }
  .theme { margin-top:12px; font-size:14px; color:#ffd9ec; }
  .hint { margin-top:6px; font-size:12px; color:#bbb; }
  a { -webkit-tap-highlight-color: transparent; }
  .stamp { margin-top:6px; color:#ccc; font-size:12px; }
  .na { padding:28px 0; color:#f87171; }
  .quiz { background:#fff8ec; color:#26221c; border-radius:18px; padding:16px 14px 14px; text-align:left;
    box-shadow:0 8px 30px rgba(0,0,0,0.45); }
  .quiz-head { font-size:18px; font-weight:800; color:#4d7c0f; margin-bottom:8px; }
  .quiz-q { font-size:22px; line-height:1.6; font-weight:600; }
  .choices { margin-top:12px; display:flex; flex-direction:column; gap:8px; }
  .choice { font-size:20px; font-weight:700; padding:15px; border-radius:12px; border:2px solid #d6cdbb;
    background:#fff; color:#26221c; text-align:left; }
  .choice.correct { border-color:#22c55e; background:#dcfce7; }
  .choice.wrong { border-color:#ef4444; background:#fee2e2; }
  .choice.dim { opacity:.45; }
  .result { display:none; margin-top:12px; font-size:15px; line-height:1.6; }
  .result .ok { color:#15803d; font-weight:800; font-size:17px; }
  .result .ng { color:#dc2626; font-weight:800; font-size:17px; }
  .result .expl { margin-top:6px; color:#44403c; }
</style></head><body><div class="shade">
${quizHtml}
${movieB64 ? `<video autoplay muted loop playsinline src="data:video/mp4;base64,${movieB64}"></video><div class="hint">このページを閉じると Muse が開きます</div>` : ""}
  ${priceHtml}
  ${themeText ? `<div class="theme">${themeText}</div>` : ""}
  <div class="stamp">価格は開いた時点の現在値です（${stamp}）</div>
</div></body></html>`;
  await WebView.loadHTML(html, null, null, true);
  // ページを閉じたら Muse を開く（Scriptable の画面内タップではアプリを直接開けないため）
  Safari.open("https://muse.ai/");
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  const theme = await fetchJSONFile("today.json");
  await showTapPage(theme);
}
Script.complete();
