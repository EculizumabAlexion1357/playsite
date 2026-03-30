/*
  OGTT–DM Risk Stratifier (Fresh)
  Implements the stepwise logic from the user's Figure 1 flowchart:
  - Step 1: OGTT indication triggers
  - Step 2: ATP III metabolic syndrome (≥3/5)
  - Step 3: High-risk prognostic marker combinations
  - Step 4: Age-based recommendation for high-risk group

  NOTE: This is clinician-facing/educational decision support only.
*/

const $ = (id) => document.getElementById(id);

const state = {
  unitMode: 'US',
  baseline: null,
};

// ---------- unit conversions ----------
const conv = {
  // glucose
  mgdl_to_mmol: (mgdl) => mgdl / 18.0,
  mmol_to_mgdl: (mmol) => mmol * 18.0,
  // insulin
  mU_to_pmol: (mu) => mu * 6.0,   // as used in the original app
  pmol_to_mU: (pmol) => pmol / 6.0,
  // weight/height
  lb_to_kg: (lb) => lb * 0.45359237,
  kg_to_lb: (kg) => kg / 0.45359237,
  in_to_cm: (inch) => inch * 2.54,
  cm_to_in: (cm) => cm / 2.54,
  // lipids
  tg_mgdl_to_mmol: (mgdl) => mgdl * 0.01129,
  tg_mmol_to_mgdl: (mmol) => mmol / 0.01129,
  hdl_mgdl_to_mmol: (mgdl) => mgdl * 0.02586,
  hdl_mmol_to_mgdl: (mmol) => mmol / 0.02586,
  // HbA1c
  a1c_ifcc_to_percent: (mmolMol) => (0.09148 * mmolMol) + 2.152,
  a1c_percent_to_ifcc: (pct) => (pct - 2.152) / 0.09148,
};

function num(id){
  const el = $(id);
  if(!el) return null;

  let v = el.value;
  if(v === '' || v === null || v === undefined) return null;

  // Allow text inputs; strip commas/spaces
  v = String(v).trim().replace(/,/g, '');

  // Allow only digits and a single decimal point
  if(!/^\d*\.?\d*$/.test(v)) return null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(id){
  return $(id).checked === true;
}

function sel(id){
  const v = $(id).value;
  return v === '' ? null : v;
}

function round(n, d=2){
  if(n === null || n === undefined || !Number.isFinite(n)) return null;
  const p = Math.pow(10,d);
  return Math.round(n*p)/p;
}



// ---------- OGTT field unit flip (convert displayed values when switching modes) ----------
function convertOgttFields(oldMode, newMode){
  if(!oldMode || !newMode || oldMode===newMode) return;
  const gIds = ['g0','g30','g60','g90','g120'];
  const iIds = ['i0','i30','i60','i90','i120'];

  const convertOne = (id, fn, decimals=1)=>{
    const v = num(id);
    if(v===null) return;
    const out = fn(v);
    // keep reasonable precision for clinical entry fields
    const r = round(out, decimals);
    $(id).value = (r===null ? '' : String(r));
  };

  if(oldMode==='US' && newMode==='SI'){
    gIds.forEach(id => convertOne(id, conv.mgdl_to_mmol, 1));
    iIds.forEach(id => convertOne(id, conv.mU_to_pmol, 1));
  } else if(oldMode==='SI' && newMode==='US'){
    gIds.forEach(id => convertOne(id, conv.mmol_to_mgdl, 1));
    iIds.forEach(id => convertOne(id, conv.pmol_to_mU, 1));
  }
}

// ---------- Non-OGTT field unit flip (convert displayed values when switching modes) ----------
function convertBaselineFields(oldMode, newMode){
  if(!oldMode || !newMode || oldMode===newMode) return;

  const convertOne = (id, fn, decimals=1)=>{
    const v = num(id);
    if(v===null) return;
    const out = fn(v);
    const r = round(out, decimals);
    $(id).value = (r===null ? '' : String(r));
  };

  // Anthropometrics
  if(oldMode==='US' && newMode==='SI'){
    convertOne('weight', conv.lb_to_kg, 1);
    convertOne('height', conv.in_to_cm, 1);
    convertOne('waist',  conv.in_to_cm, 1);
  } else if(oldMode==='SI' && newMode==='US'){
    convertOne('weight', conv.kg_to_lb, 1);
    convertOne('height', conv.cm_to_in, 1);
    convertOne('waist',  conv.cm_to_in, 1);
  }

  // Lipids
  if(oldMode==='US' && newMode==='SI'){
    convertOne('tg',  conv.tg_mgdl_to_mmol, 2);
    convertOne('hdl', conv.hdl_mgdl_to_mmol, 2);
  } else if(oldMode==='SI' && newMode==='US'){
    convertOne('tg',  conv.tg_mmol_to_mgdl, 1);
    convertOne('hdl', conv.hdl_mmol_to_mgdl, 1);
  }

  // HbA1c: follow unit mode by default (US -> %, SI -> mmol/mol)
  const a1cEl = $('a1c');
  const a1cUnitEl = $('a1cUnit');
  if(a1cEl && a1cUnitEl){
    const a1cVal = num('a1c');
    const curUnit = a1cUnitEl.value || 'percent';
    if(newMode === 'SI'){
      // prefer IFCC
      if(curUnit === 'percent'){
        if(a1cVal !== null){
          const ifcc = conv.a1c_percent_to_ifcc(a1cVal);
          const r = round(ifcc, 0);
          a1cEl.value = (r===null ? '' : String(r));
        }
        a1cUnitEl.value = 'ifcc';
      }
    } else if(newMode === 'US'){
      // prefer percent
      if(curUnit === 'ifcc'){
        if(a1cVal !== null){
          const pct = conv.a1c_ifcc_to_percent(a1cVal);
          const r = round(pct, 1);
          a1cEl.value = (r===null ? '' : String(r));
        }
        a1cUnitEl.value = 'percent';
      }
    }
  }
}
function setBadge(el, kind, text){
  el.classList.remove('good','warn','bad');
  if(kind) el.classList.add(kind);

  // Allow safe HTML for specific badges (e.g., BMI), while keeping default text behavior.
  if(text && typeof text === 'object' && typeof text.html === 'string'){
    el.innerHTML = text.html;
  } else {
    el.textContent = text;
  }
}

// ---------- calculations ----------

function getInputsCanonical(){
  // Canonical internal units:
  // - glucose: mg/dL
  // - insulin: pmol/L
  // - TG/HDL: mg/dL
  // - weight: kg
  // - height/waist: cm
  const mode = state.unitMode;

  // demographic
  const age = num('age');
  const sex = sel('sex');
  const eth = sel('eth');

  // anthropometrics
  const weightRaw = num('weight');
  const heightRaw = num('height');
  const waistRaw  = num('waist');

  const weightKg = (weightRaw == null) ? null : (mode === 'US' ? conv.lb_to_kg(weightRaw) : weightRaw);
  const heightCm = (heightRaw == null) ? null : (mode === 'US' ? conv.in_to_cm(heightRaw) : heightRaw);
  const waistCm  = (waistRaw  == null) ? null : (mode === 'US' ? conv.in_to_cm(waistRaw) : waistRaw);

  // lipids
  const tgRaw  = num('tg');
  const hdlRaw = num('hdl');
  const tgMgdl  = (tgRaw  == null) ? null : (mode === 'US' ? tgRaw  : conv.tg_mmol_to_mgdl(tgRaw));
  const hdlMgdl = (hdlRaw == null) ? null : (mode === 'US' ? hdlRaw : conv.hdl_mmol_to_mgdl(hdlRaw));

  // BP / A1c
  const sbp = num('sbp');
  const dbp = num('dbp');
  const a1cRaw = num('a1c');
  const a1cUnit = (typeof sel === 'function') ? (sel('a1cUnit') || 'percent') : 'percent';
  const a1c = (a1cRaw == null) ? null : (a1cUnit === 'ifcc' ? conv.a1c_ifcc_to_percent(a1cRaw) : a1cRaw);
  const bpMeds = sel('bpMeds');

  // risk factors
  const gdm = bool('gdm');
  const pancreatitis = bool('pancreatitis');
  const masld = bool('masld');
  const pcos = bool('pcos');
  const fdr = bool('fdr');

  // OGTT glucose
  const g0raw = num('g0');
  const g30raw = num('g30');
  const g60raw = num('g60');
  const g90raw = num('g90');
  const g120raw = num('g120');

  const g0 = (g0raw==null)?null:(mode==='US'?g0raw:conv.mmol_to_mgdl(g0raw));
  const g30 = (g30raw==null)?null:(mode==='US'?g30raw:conv.mmol_to_mgdl(g30raw));
  const g60 = (g60raw==null)?null:(mode==='US'?g60raw:conv.mmol_to_mgdl(g60raw));
  const g90 = (g90raw==null)?null:(mode==='US'?g90raw:conv.mmol_to_mgdl(g90raw));
  const g120 = (g120raw==null)?null:(mode==='US'?g120raw:conv.mmol_to_mgdl(g120raw));

  // OGTT insulin
  const i0raw = num('i0');
  const i30raw = num('i30');
  const i60raw = num('i60');
  const i90raw = num('i90');
  const i120raw = num('i120');

  const i0 = (i0raw==null)?null:(mode==='US'?i0raw:conv.pmol_to_mU(i0raw));
  const i30 = (i30raw==null)?null:(mode==='US'?i30raw:conv.pmol_to_mU(i30raw));
  const i60 = (i60raw==null)?null:(mode==='US'?i60raw:conv.pmol_to_mU(i60raw));
  const i90 = (i90raw==null)?null:(mode==='US'?i90raw:conv.pmol_to_mU(i90raw));
  const i120 = (i120raw==null)?null:(mode==='US'?i120raw:conv.pmol_to_mU(i120raw));

  return {
    mode,
    age, sex, eth,
    weightKg, heightCm, waistCm,
    tgMgdl, hdlMgdl,
    sbp, dbp, a1c, bpMeds,
    gdm, pancreatitis, masld, pcos, fdr,
    g0, g30, g60, g90, g120,
    i0, i30, i60, i90, i120,
  };
}

function bmiFromKgCm(kg, cm){
  if(kg == null || cm == null || cm <= 0) return null;
  const m = cm / 100.0;
  return kg / (m*m);
}

function isHighRiskEthnicity(eth){
  return ['African American','Hispanic/Latino','Native American','Asian American'].includes(eth || '');
}

function step1_ogttIndication(x){
  // From Figure 1 Step 1
  const reasons = [];

  // FPG 100-125
  if(x.g0 != null && x.g0 >= 100 && x.g0 < 126) reasons.push('FPG 100–125 mg/dL');

  // A1c 5.7–6.4
  if(x.a1c != null && x.a1c >= 5.7 && x.a1c <= 6.4) reasons.push('HbA1c 5.7–6.4%');

  // GDM / pancreatitis
  if(x.gdm) reasons.push('History of gestational diabetes');
  if(x.pancreatitis) reasons.push('History of pancreatitis');

  // BMI trigger + ≥1 additional risk factor
  const bmi = bmiFromKgCm(x.weightKg, x.heightCm);
  const bmiThresh = (x.eth === 'Asian American') ? 23 : 25;

  const hasBmiTrigger = (bmi != null && bmi >= bmiThresh);

  const hasHTN = (
    (x.sbp != null && x.dbp != null && (x.sbp >= 130 || x.dbp >= 80)) ||
    x.bpMeds === 'yes'
  );

  const hasDyslipidemia = (
    (x.hdlMgdl != null && x.hdlMgdl < 35) ||
    (x.tgMgdl != null && x.tgMgdl > 250)
  );

  const hasOther = x.masld || x.pcos || x.fdr || isHighRiskEthnicity(x.eth);

  if(hasBmiTrigger && (x.masld || hasHTN || hasDyslipidemia || x.pcos || x.fdr || isHighRiskEthnicity(x.eth))) {
    // Provide a specific, human-readable list (user request: list all reasons, not just a generic BMI trigger)
    const extras = [];
    if(x.masld) extras.push('MASLD');
    if(hasHTN) extras.push('Hypertension ≥130/80 mm Hg or on treatment');
    if(hasDyslipidemia) extras.push('Dyslipidemia (HDL <35 mg/dL and/or triglycerides >250 mg/dL)');
    if(x.pcos) extras.push('PCOS');
    if(x.fdr) extras.push('First-degree relative with T2D');
    if(isHighRiskEthnicity(x.eth)) extras.push('High-risk ethnicity');
    reasons.push(`BMI ≥${bmiThresh} kg/m² plus one or more of the following:`);
    extras.forEach(e => reasons.push(e));
  }

  const indicated = reasons.length > 0;

  return {
    indicated,
    reasons,
    bmi,
    bmiThresh,
    detail: { hasBmiTrigger, hasHTN, hasDyslipidemia, hasOther }
  };
}

function step2_metabolicSyndrome(x){
  // ATP III criteria (≥3/5)
  // Waist: >102 cm men, >88 cm women
  const met = [];
  const notMet = [];
  const unknown = [];

  // waist
  if(x.sex == null || x.waistCm == null){
    unknown.push('Waist circumference');
  } else {
    const ok = (x.sex === 'M' ? x.waistCm > 102 : x.waistCm > 88);
    (ok ? met : notMet).push('Waist circumference');
  }

  // TG
  if(x.tgMgdl == null) unknown.push('Triglycerides');
  else (x.tgMgdl >= 150 ? met : notMet).push('Triglycerides');

  // HDL
  if(x.sex == null || x.hdlMgdl == null) unknown.push('HDL');
  else {
    const ok = (x.sex === 'M' ? x.hdlMgdl < 40 : x.hdlMgdl < 50);
    (ok ? met : notMet).push('HDL');
  }

  // BP
  const onTx = x.bpMeds === 'yes';
  if(onTx){
    met.push('Blood pressure');
  } else if(x.sbp == null || x.dbp == null){
    unknown.push('Blood pressure');
  } else {
    const ok = (x.sbp >= 130 || x.dbp >= 85);
    (ok ? met : notMet).push('Blood pressure');
  }

  // FPG
  if(x.g0 == null) unknown.push('Fasting glucose');
  else (x.g0 >= 100 ? met : notMet).push('Fasting glucose');

  const count = met.length;
  const complete = (unknown.length === 0);
  const present = (count >= 3) && complete;
  const maybePresent = (count >= 3) && !complete;

  return {
    count, present, maybePresent, complete,
    met, notMet, unknown
  };
}

function calc_igi(x){
  // IGI = (I30 - I0) / (G30 - G0)
  // IMPORTANT: This ratio is unit-sensitive.
  // We ALWAYS compute IGI in *US conventional units*:
  //   - Insulin in mU/L (µU/mL)
  //   - Glucose in mg/dL
  // Our internal canonical representation is:
  //   - Glucose in mg/dL
  //   - Insulin in pmol/L
  // Therefore we convert insulin pmol/L -> mU/L by dividing by 6 before computing IGI.
  // (This matches the user requirement: if SI is entered, it must be converted and IGI still computed in US units.)
  if(x.i0 == null || x.i30 == null || x.g0 == null || x.g30 == null) return null;  const dI = x.i30 - x.i0;
  const dG = x.g30 - x.g0;
  if(dG === 0) return null;
  return dI / dG;
}


function calc_pg_auc_weighted(x){
  // Weighted PG AUC (mg·h/dL) per requested formula:
  // (PG0 + 2×PG30 + 3×PG60 + 2×PG120) / 4
  // Uses glucose in canonical mg/dL.
  if(x.g0 == null || x.g30 == null || x.g60 == null || x.g120 == null) return null;
  return (x.g0 + 2*x.g30 + 3*x.g60 + 2*x.g120) / 4;
}

function calc_matsuda(x){
  // Matsuda index (ISI): 10,000 / sqrt( (G0 * I0) * (Gmean * Imean) )
  // Glucose in mg/dL. Insulin in mU/L (µU/mL).
  const gVals = [x.g0, x.g30, x.g60, x.g90, x.g120].filter(v => v != null);
  const iValsPmol = [x.i0, x.i30, x.i60, x.i90, x.i120].filter(v => v != null);

  if(x.g0 == null || x.i0 == null) return null;
  if(gVals.length < 2 || iValsPmol.length < 2) return null;  const iVals = [x.i0, x.i30, x.i60, x.i90, x.i120].filter(v => v != null);

  const gMean = gVals.reduce((a,b)=>a+b,0) / gVals.length;
  const iMean = iVals.reduce((a,b)=>a+b,0) / iVals.length;

  const denom = Math.sqrt((x.g0 * x.i0) * (gMean * iMean));
  if(!Number.isFinite(denom) || denom <= 0) return null;
  return 10000 / denom;
}


function calc_homa_ir(x){
  // HOMA-IR = (G0 [mg/dL] × I0 [mU/L, i.e., µU/mL]) / 405
  // IMPORTANT: Always computed in US conventional units.
  // In getInputsCanonical(), glucose is converted to mg/dL and insulin to mU/L when user selects SI.
  if(x.g0 == null || x.i0 == null) return null;
  return (x.g0 * x.i0) / 405.0;
}

function calc_di(x){
  // Disposition Index (DI) = Matsuda index × IGI
  const m = calc_matsuda(x);
  const igi = calc_igi(x);
  if(m == null || igi == null) return null;
  return m * igi;
}

function calc_stumvoll1(x){
  // 1st-phase insulin secretion (Stumvoll)
  // User-supplied equation:
  //   1283 + (1.829 × I30) – (138.7 × G30) + (3.772 × I0)
  // Units for this published coefficient set are:
  //   - Insulin in pmol/L
  //   - Glucose in mmol/L
  // Our canonical representation uses glucose in mg/dL, so we convert G30 -> mmol/L by dividing by 18.
  if(x.i0 == null || x.i30 == null || x.g30 == null) return null;
  const g30_mmol = x.g30 / 18;
    const i30_pmol = conv.mU_to_pmol(x.i30);
  const i0_pmol = conv.mU_to_pmol(x.i0);
  return 1283 + (1.829 * i30_pmol) - (138.7 * g30_mmol) + (3.772 * i0_pmol);
}

function step3_highRisk(x, metsRes){
  // Figure 1 Step 3 high-risk definitions.
  // Requires ability to classify IFG/IGT, 1h PG >155, MetS, A1c 6.0–6.4, and/or IGI and/or 1st-phase.

  const g0 = x.g0;
  const g60 = x.g60;
  const g120 = x.g120;

  const ifg = (g0 != null && g0 >= 100 && g0 < 126);
  const igt = (g120 != null && g120 >= 140 && g120 < 200);
  const oneHr = (g60 != null && g60 > 155);

  const a1c6064 = (x.a1c != null && x.a1c >= 6.0 && x.a1c <= 6.4);

  const igi = calc_igi(x);
  const igiLow = (igi != null && igi <= 0.82);

  // 1st-phase threshold exists in the figure (≤899 pmol/L) but no formula supplied.
  // We cannot compute it without the coefficients.
  const stum1 = calc_stumvoll1(x);
  const stumLow = (stum1 != null && stum1 <= 899);

  const metsPresent = metsRes.present;
  const metsKnown = metsRes.complete;

  const triggers = [];

  // • IGT + 1-hour PG >155 + metabolic syndrome
  if(igt && oneHr && metsPresent) triggers.push('IGT + 1-hour PG >155 mg/dL + metabolic syndrome');

  // • Combined IFG and IGT
  if(ifg && igt) triggers.push('Combined IFG and IGT');

  // • IFG + 1-hour PG >155 + metabolic syndrome
  if(ifg && oneHr && metsPresent) triggers.push('IFG + 1-hour PG >155 mg/dL + metabolic syndrome');

  // • IGT or IFG + 1-hour PG >155 + HbA1c 6.0–6.4
  if((igt || ifg) && oneHr && a1c6064) triggers.push('IGT or IFG + 1-hour PG >155 mg/dL + HbA1c 6.0–6.4%');

  // • IGT or IFG + 1-hour PG >155 + IGI ≤0.82 and/or 1st-phase ≤899
  if((igt || ifg) && oneHr && (igiLow || stumLow)) {
    const sub = [];
    if(igiLow) sub.push('IGI ≤0.82');
    if(stumLow) sub.push('1st-phase ≤899 pmol/L');
    triggers.push(`IGT or IFG + 1-hour PG >155 mg/dL + ${sub.join(' and ')}`);
  }

  // Determine evaluability: the user may not have provided enough info.
  // High-risk should only be asserted if the needed components for a triggered rule are known.
  // We conservatively treat metabolic syndrome as "unknown" unless complete.

  const anyHighRisk = triggers.length > 0;

  // meta status
  const status = (anyHighRisk) ? 'HIGH_RISK' : 'NOT_HIGH_RISK';

  return {
    status,
    triggers,
    ifg, igt, oneHr,
    a1c6064,
    igi, igiLow,
    stum1, stumLow,
    metsPresent,
    metsKnown,
  };
}

function step4_recommendation(x, step3){
  if(step3.status !== 'HIGH_RISK'){
    return { applicable:false, badge:{kind:null,text:'Not applicable'}, text:'Not in high-risk group based on Step 3 criteria.' };
  }
  if(x.age == null) return { applicable:true, badge:{kind:'warn',text:'Age needed'}, text:'Enter age to apply Step 4.' };

  if(x.age < 40) {
    return { applicable:true, badge:{kind:'bad',text:'<40'}, text:'Age <40 years — Not a candidate (high risk).' };
  }
  if(x.age >= 40 && x.age <= 49) {
    return { applicable:true, badge:{kind:'warn',text:'40–49'}, text:'Age 40–49 years — Consider only if able to reverse high-risk prognostic markers with weight loss on repeat OGTT.' };
  }
  return { applicable:true, badge:{kind:'good',text:'≥50'}, text:'Age ≥50 years — Can be accepted after risk mitigation with 5–10% weight loss.' };
}

// ---------- UI update ----------

function updateUnitLabels(){
  const mode = state.unitMode;
  $('unitLabel').textContent = mode;

  $('weightLabel').textContent = `Weight (${mode === 'US' ? 'lb' : 'kg'})`;
  $('heightLabel').textContent = `Height (${mode === 'US' ? 'in' : 'cm'})`;
  $('waistLabel').textContent  = `Waist circumference (${mode === 'US' ? 'in' : 'cm'})`;

  $('tgLabel').textContent  = `Triglycerides (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`;
  $('hdlLabel').textContent = `HDL (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`;

  const a1cUnitEl = $('a1cUnit');
  const a1cUnit = a1cUnitEl ? a1cUnitEl.value : 'percent';
  const a1cLabel = $('a1cLabel');
  if(a1cLabel){
    a1cLabel.textContent = `HbA1c (${a1cUnit === 'ifcc' ? 'mmol/mol' : '%'})`;
  }

  $('gluLabel').textContent = `Glucose (${mode === 'US' ? 'mg/dL' : 'mmol/L'})`;
  $('insLabel').textContent = `Insulin (${mode === 'US' ? 'mU/L' : 'pmol/L'})`;

  $('unitPill').innerHTML = `Units: <b id="unitLabel">${mode}</b>`;

  // Ensure placeholders show units (helps prevent "unit not showing" issues)
  try{
    const mode = state.unitMode;
    const w = $('weight'), h = $('height'), wc = $('waist');
    if(w) w.placeholder  = (mode==='US' ? 'lb' : 'kg');
    if(h) h.placeholder  = (mode==='US' ? 'in' : 'cm');
    if(wc) wc.placeholder = (mode==='US' ? 'in' : 'cm');
  }catch(e){}

}

function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  window.setTimeout(()=>t.classList.remove('show'), 1200);
}

function buildSummary(x, step1, step2, step3, step4){
  const bmi = step1.bmi;
  const bmiStr = (bmi == null) ? '—' : `${round(bmi,1)} kg/m²`;

  const metsStr = step2.complete ? (step2.present ? `PRESENT (${step2.count}/5)` : `ABSENT (${step2.count}/5)`) : `UNKNOWN (${step2.count}/5 met; missing: ${step2.unknown.join(', ') || '—'})`;

  const igiStr = (step3.igi == null) ? '—' : `${round(step3.igi,2)}${step3.igiLow ? ' (≤0.82)' : ''}`;

  const stumStr = (step3.stum1 == null) ? '—' : `${round(step3.stum1,0)}${step3.stumLow ? ' (≤899)' : ''}`;

  const pgauc = calc_pg_auc_weighted(x);
  const matsuda = calc_matsuda(x);
  const homa = calc_homa_ir(x);
  const di = calc_di(x);
  const pgaucStr = (pgauc == null) ? '—' : `${round(pgauc,1)} mg·h/dL`;
  const matsudaStr = (matsuda == null) ? '—' : `${round(matsuda,2)}`;
  const homaStr = (homa == null) ? '—' : `${round(homa,2)}`;
  const diStr = (di == null) ? '—' : `${round(di,2)}`;

  const oneHrStr = (step3.oneHr ? 'Yes' : (x.g60==null ? 'Unknown' : 'No'));

  const lines = [];
  lines.push('OGTT–DM Risk Stratifier');
  lines.push('—');
  if(x.age != null) lines.push(`Age: ${x.age}`);
  if(bmi != null) lines.push(`BMI: ${round(bmi,1)} kg/m²`);
  lines.push('');

  lines.push(`Step 1 (OGTT indication): ${step1.indicated ? 'YES' : 'NO'}`);
  if(step1.indicated) lines.push(`Reasons: ${step1.reasons.join('; ')}`);
  else lines.push('Reasons: No Step 1 criteria met based on current inputs.');

  lines.push('');
  lines.push(`Step 2 (Metabolic syndrome): ${metsStr}`);

  lines.push('');
  lines.push(`Step 3 (High-risk prognostic markers): ${step3.status === 'HIGH_RISK' ? 'HIGH RISK' : 'Not high-risk'}`);
  if(step3.status === 'HIGH_RISK') lines.push(`Triggered findings: ${step3.triggers.join('; ')}`);
  else lines.push('Triggered findings: No Step 3 markers triggered based on current inputs.');

  lines.push('');
  lines.push('Calculated indices:');
  lines.push(`- IFG: ${step3.ifg ? 'Yes' : (x.g0==null?'Unknown':'No')}`);
  lines.push(`- IGT: ${step3.igt ? 'Yes' : (x.g120==null?'Unknown':'No')}`);
  lines.push(`- 1-hour PG >155 mg/dL: ${oneHrStr}`);
  lines.push(`- IGI: ${igiStr}`);
  lines.push(`- Matsuda index: ${matsudaStr}`);
  lines.push(`- HOMA-IR: ${homaStr}`);
  lines.push(`- Disposition Index (DI): ${diStr}`);
  lines.push(`- PG AUC (weighted): ${pgaucStr}`);
  lines.push(`- Stumvoll 1st-phase: ${stumStr}`);

  lines.push('');
  lines.push('Step 4 recommendation:');
  lines.push(step4.text);

  lines.push('');
  lines.push('Disclaimer: Clinical decision support/education tool. No patient data are stored. Use clinical judgment.');

  lines.push('');
  lines.push('Build v5-2026-01-19');
  lines.push('Designed by Katafan Achkar, MD, FASN. Development assistance: ChatGPT (OpenAI).');

  return lines.join('\n');
}

function render(){
  updateUnitLabels();

  const x = getInputsCanonical();

  // Step 1
  const step1 = step1_ogttIndication(x);
  const bmi = step1.bmi;
  if(bmi == null){
    setBadge($('bmiBadge'), null, {html: 'BMI: <span class="bmiNum">—</span>'});
  } else {
    // Style: <25 green, 25–29.9 amber, ≥30 red
    const k = (bmi >= 30) ? 'bad' : (bmi >= 25 ? 'warn' : 'good');
    setBadge($('bmiBadge'), k, {html: `BMI: <span class="bmiNum">${round(bmi,1)}</span> <span class="bmiUnit">kg/m²</span>`});
  }

  setBadge($('step1Badge'), step1.indicated ? 'warn' : 'good', step1.indicated ? 'YES' : 'NO');
  $('step1Reasons').innerHTML = step1.indicated
    ? `<ul>${step1.reasons.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>`
    : `<div class="hint">No Step 1 indication criteria met based on current inputs.</div>`;

  // Step 2
  const step2 = step2_metabolicSyndrome(x);
  const step2Text = step2.complete
    ? (step2.present ? `Present (${step2.count}/5)` : `Not present (${step2.count}/5)`) 
    : `Incomplete (${step2.count}/5 met)`;
  setBadge($('step2Badge'), step2.complete ? (step2.present ? 'bad' : 'good') : 'warn', step2Text);
  const metsDetail = [];
  metsDetail.push(`<div class="hint"><b>${step2.count}/5</b> criteria met${step2.complete ? '' : ' (incomplete)'}.</div>`);
  if(step2.met.length) metsDetail.push(`<div class="hint">Met: ${escapeHtml(step2.met.join(', '))}</div>`);
  if(step2.notMet.length) metsDetail.push(`<div class="hint">Not met: ${escapeHtml(step2.notMet.join(', '))}</div>`);
  if(step2.unknown.length) metsDetail.push(`<div class="hint">Missing: ${escapeHtml(step2.unknown.join(', '))}</div>`);
  $('metsDetail').innerHTML = metsDetail.join('');

  // Step 3
  const step3 = step3_highRisk(x, step2);
  setBadge($('step3Badge'), step3.status === 'HIGH_RISK' ? 'bad' : 'good', step3.status === 'HIGH_RISK' ? 'HIGH RISK' : 'Not high-risk');

  const s3 = [];
  s3.push(`<div class="hint">IFG: <b>${step3.ifg ? 'Yes' : (x.g0==null?'Unknown':'No')}</b> · IGT: <b>${step3.igt ? 'Yes' : (x.g120==null?'Unknown':'No')}</b> · 1-h PG >155: <b>${step3.oneHr ? 'Yes' : (x.g60==null?'Unknown':'No')}</b> · MetS: <b>${step2.complete ? (step2.present?'Yes':'No') : 'Unknown'}</b> · A1c 6.0–6.4: <b>${step3.a1c6064 ? 'Yes' : (x.a1c==null?'Unknown':'No')}</b></div>`);
  if(step3.triggers.length){
    s3.push(`<ul>${step3.triggers.map(t=>`<li>${escapeHtml(t)}</li>`).join('')}</ul>`);
  } else {
    s3.push(`<div class="hint">No Step 3 markers triggered based on current inputs.</div>`);
  }
  // clarify stumvoll behavior
  s3.push(`<div class="hint">Stumvoll 1st-phase is computed using the user-supplied equation: 1283 + (1.829×I30) − (138.7×G30) + (3.772×I0), with insulin in pmol/L and G30 in mmol/L.</div>`);

  $('step3Detail').innerHTML = s3.join('');

  // Step 4
  const step4 = step4_recommendation(x, step3);
  setBadge($('step4Badge'), step4.badge.kind, step4.badge.text);
  $('step4Detail').textContent = step4.text;

  // top risk badge
  setBadge($('riskBadge'), step3.status === 'HIGH_RISK' ? 'bad' : 'good', step3.status === 'HIGH_RISK' ? 'High risk' : 'Not high-risk');

  // indices
  $('igi').textContent = (step3.igi == null) ? '—' : `${round(step3.igi,2)}${step3.igiLow ? ' (≤0.82)' : ''}`;
  $('stum1').textContent = (step3.stum1 == null) ? '—' : `${round(step3.stum1,0)}${step3.stumLow ? ' (≤899)' : ''}`;

  const pgauc = calc_pg_auc_weighted(x);
  const matsuda = calc_matsuda(x);
  const homa = calc_homa_ir(x);
  const di = calc_di(x);
  if($('pgauc')) $('pgauc').textContent = (pgauc == null) ? '—' : `${round(pgauc,1)}`;
  if($('matsuda')) $('matsuda').textContent = (matsuda == null) ? '—' : `${round(matsuda,2)}`;
  if($('homa')) $('homa').textContent = (homa == null) ? '—' : `${round(homa,2)}`;
  if($('di')) $('di').textContent = (di == null) ? '—' : `${round(di,2)}`;

  $('ifg').textContent = step3.ifg ? 'Yes' : (x.g0==null?'Unknown':'No');
  $('igt').textContent = step3.igt ? 'Yes' : (x.g120==null?'Unknown':'No');
  $('onehr').textContent = step3.oneHr ? 'Yes' : (x.g60==null?'Unknown':'No');
  $('mets').textContent = step2.complete ? (step2.present ? 'Yes' : 'No') : 'Unknown';

  // summary
  $('summary').textContent = buildSummary(x, step1, step2, step3, step4);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// ---------- persistence helpers ----------
function snapshot(){
  const ids = [
    'age','sex','eth','weight','height','waist','tg','hdl','a1c','sbp','dbp','bpMeds',
    'gdm','pancreatitis','masld','pcos','fdr',
    'g0','g30','g60','g90','g120','i0','i30','i60','i90','i120'
  ];
  const out = { unitMode: state.unitMode, v: {} };
  ids.forEach(id => {
    const el = $(id);
    if(!el) return;
    if(el.type === 'checkbox') out.v[id] = el.checked;
    else out.v[id] = el.value;
  });
  return out;
}

function applySnapshot(snap){
  if(!snap || !snap.v) return;
  if(snap.unitMode) {
    state.unitMode = snap.unitMode;
    $('unitMode').value = snap.unitMode;
  }
  Object.entries(snap.v).forEach(([id,val])=>{
    const el = $(id);
    if(!el) return;
    if(el.type === 'checkbox') el.checked = !!val;
    else el.value = val;
  });
}

function saveToLocal(key, obj){
  localStorage.setItem(key, JSON.stringify(obj));
}

function loadFromLocal(key){
  try{
    const s = localStorage.getItem(key);
    if(!s) return null;
    return JSON.parse(s);
  } catch { return null; }
}

// ---------- events ----------
function wire(){
  // CSV button safe wire (never blocks calculator)
  try{
    const b = $('downloadCsv');
    if(b && typeof exportCsvAll === 'function') b.addEventListener('click', exportCsvAll);
  }catch(e){ console.error('CSV wire error', e); }

  // default test date = today
  const td = $('testDate');
  if(td && !td.value){ td.value = new Date().toISOString().slice(0,10); }

  // inputs
  const allInputs = document.querySelectorAll('input,select');
  allInputs.forEach(el => {
    el.addEventListener('input', () => {
      saveToLocal('ogtt_fresh_current', snapshot());
      render();
    });
    el.addEventListener('change', () => {
      saveToLocal('ogtt_fresh_current', snapshot());
      render();
    });
  });

  $('unitMode').addEventListener('change', (e)=>{
    const newMode = e.target.value;
    const oldMode = state.unitMode;
    if(newMode && oldMode && newMode !== oldMode){
      convertBaselineFields(oldMode, newMode);
      convertOgttFields(oldMode, newMode);
    }
    state.unitMode = newMode;
    saveToLocal('ogtt_fresh_current', snapshot());
    render();
  });

  
  // --- Patient identifiers (print/copy only; not stored) ---
  function patientHeaderText(){
    const include = $('includePt');
    if(!include || !include.checked) return '';
    const name = $('ptName') ? String($('ptName').value || '').trim() : '';
    const mrn  = $('ptMRN') ? String($('ptMRN').value || '').trim() : '';
    const dob  = $('ptDOB') ? String($('ptDOB').value || '').trim() : '';

    const tdate = $('testDate') ? String($('testDate').value || '').trim() : '';
    if(!name && !mrn && !dob) return '';

    let out = 'Patient identifiers:\n';
    if(name) out += 'Name: ' + name + '\n';
    if(mrn)  out += 'MRN: ' + mrn + '\n';
    if(dob)  out += 'DOB: ' + dob + '\n';
    if(tdate) out += 'OGTT date: ' + tdate + '\n';
    out += '\n';
    return out;
  }

  function requireIdentifiersForExport(){
    const name = $('ptName') ? String($('ptName').value || '').trim() : '';
    const mrn  = $('ptMRN') ? String($('ptMRN').value || '').trim() : '';
    const dob  = $('ptDOB') ? String($('ptDOB').value || '').trim() : '';
    const tdate = $('testDate') ? String($('testDate').value || '').trim() : '';
    const include = $('includePt');

    if(!include) return true;
    if(!include.checked) include.checked = true;

    if(!name || !mrn || !dob || !tdate){
      toast('Enter Name, MRN, DOB, and OGTT test date to export/print locally.');
      if(!name && $('ptName')) $('ptName').focus();
      else if(!mrn && $('ptMRN')) $('ptMRN').focus();
      else if(!dob && $('ptDOB')) $('ptDOB').focus();
      else if(!tdate && $('testDate')) $('testDate').focus();
      return false;
    }


  // --- CSV export (append-ready; includes all inputs + indices) ---
  function normalizeForCsv(s){
    if(s===null || s===undefined) return '';
    return String(s)
      .replace(/\u2265/g, '>=')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00a0/g, ' ');
  }

  function csvEscape(v){
    const s = (v===null || v===undefined) ? '' : String(v);
    if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  function downloadTextFile(filename, mime, content){
    // Add UTF-8 BOM for CSV so Excel renders symbols correctly
    const BOM = '\ufeff';
    const payload = (mime && mime.indexOf('text/csv') === 0) ? (BOM + content) : content;
    const blob = new Blob([payload], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 1500);
  }

  function buildCsvRow(){
    const x = getInputsCanonical();

    const step1 = step1_ogttIndication(x);
    const bmi = step1 ? step1.bmi : null;
    const step2 = step2_metabolicSyndrome(x);
    const step3 = step3_highRisk(x, step2);
    const step4 = step4_recommendation(x, step3);

    // calculated indices
    const IGI = calc_igi(x);
    const STUMVOLL_1ST_PHASE = calc_stumvoll1(x);
    const PG_AUC_WEIGHTED = calc_pg_auc_weighted(x);
    const MATSUDA = calc_matsuda(x);
    const HOMA_IR = calc_homa_ir(x);
    const DI = calc_di(x);

    // identifiers + date of service
    const NAME = $('ptName') ? String($('ptName').value || '').trim() : '';
    const MRN  = $('ptMRN') ? String($('ptMRN').value || '').trim() : '';
    const DOB  = $('ptDOB') ? String($('ptDOB').value || '').trim() : '';
    const OGTT_TEST_DATE = $('testDate') ? String($('testDate').value || '').trim() : '';
    const VISIT_TYPE = $('visitType') ? String($('visitType').value || '').trim() : '';
    const ORDERING_PROVIDER = $('orderingProvider') ? String($('orderingProvider').value || '').trim() : '';

    // raw typed values (exactly as entered)
    const WEIGHT_RAW = $('weight') ? String($('weight').value || '').trim() : '';
    const HEIGHT_RAW = $('height') ? String($('height').value || '').trim() : '';
    const WAIST_RAW  = $('waist') ? String($('waist').value || '').trim() : '';
    const TG_RAW     = $('tg') ? String($('tg').value || '').trim() : '';
    const HDL_RAW    = $('hdl') ? String($('hdl').value || '').trim() : '';
    const A1C_RAW    = $('a1c') ? String($('a1c').value || '').trim() : '';

    const SUMMARY = normalizeForCsv($('summary') ? $('summary').textContent.trim() : '');
    const RECOMMENDATION = normalizeForCsv(step4 ? step4.text : '');
    const HIGH_RISK_TRIGGERS = normalizeForCsv(step3 && step3.triggers ? step3.triggers.join(' | ') : '');

    const row = {
      OGTT_TEST_DATE,
      UNIT_MODE: state.unitMode || '',
      NAME,
      MRN,
      DOB,
      VISIT_TYPE,
      ORDERING_PROVIDER,

      AGE_YEARS: x.age,
      SEX: x.sex,
      ETHNICITY: x.eth,

      WEIGHT_RAW,
      HEIGHT_RAW,
      WAIST_RAW,
      WEIGHT_KG: x.weight,
      HEIGHT_CM: x.height,
      WAIST_CM: x.waist,
      BMI: bmi,

      SBP: x.sbp,
      DBP: x.dbp,
      BP_MEDS: x.bpMeds,

      TG_RAW,
      HDL_RAW,
      A1C_RAW,

      TG: x.tg,
      HDL: x.hdl,
      A1C: x.a1c,

      // OGTT glucose (mg/dL canonical) and insulin (pmol/L canonical)
      G0: x.g0, G30: x.g30, G60: x.g60, G90: x.g90, G120: x.g120,
      I0: x.i0, I30: x.i30, I60: x.i60, I90: x.i90, I120: x.i120,

      IGI,
      STUMVOLL_1ST_PHASE,
      PG_AUC_WEIGHTED,
      MATSUDA,
      HOMA_IR,
      DI,

      METS_COUNT: step2 ? step2.count : '',
      METS_PRESENT: step2 ? step2.present : '',

      IFG: step3 ? step3.ifg : '',
      IGT: step3 ? step3.igt : '',
      ONE_HR_PG_GT_155: step3 ? step3.oneHr : '',
      A1C_6_0_TO_6_4: step3 ? step3.a1c6064 : '',
      IGI_LOW: step3 ? step3.igiLow : '',
      STUMVOLL1_LOW: step3 ? step3.stumLow : '',
      HIGH_RISK_STATUS: step3 ? step3.status : '',
      HIGH_RISK: step3 ? (step3.status === 'HIGH_RISK') : '',
      HIGH_RISK_TRIGGERS,

      RECOMMENDATION,
      SUMMARY
    };

    const headers = Object.keys(row);
    const values = headers.map(h => (row[h]===null || row[h]===undefined) ? '' : row[h]);
    return {headers, values};
  }

  function exportCsvAll(){
    if(typeof requireIdentifiersForExport === 'function' && !requireIdentifiersForExport()) return;
    const {headers, values} = buildCsvRow();
    const csv = headers.map(csvEscape).join(',') + '\n' + values.map(csvEscape).join(',') + '\n';
    const stamp = (new Date().toISOString().slice(0,10));
    downloadTextFile(`OGTT_Risk_${stamp}.csv`, 'text/csv;charset=utf-8', csv);
    toast('CSV downloaded');
  }

    return true;
  }



  function updatePrintHeader(){
    const header = $('printHeader');
    if(!header) return;
    const txt = patientHeaderText();
    header.textContent = txt ? (txt + 'Generated: ' + new Date().toLocaleString()) : '';
    // If no identifiers, keep it visually minimal on print
    if(!txt) header.textContent = '';
  }

$('copySummary').addEventListener('click', async ()=>{
    try{
      await navigator.clipboard.writeText(patientHeaderText() + $('summary').textContent);
      toast('Summary copied');
    } catch {
      toast('Copy failed (browser blocked)');
    }
  });

  $('print').addEventListener('click', ()=>{ updatePrintHeader(); window.print(); });
  $('exportPdf').addEventListener('click', ()=>{ updatePrintHeader(); window.print(); });
  // Keep print header updated as patient fields change (calculator page only)
  ['includePt','ptName','ptMRN','ptDOB','testDate'].forEach(id=>{
    const el = $(id);
    if(el) el.addEventListener('input', updatePrintHeader);
    if(el && el.type === 'checkbox') el.addEventListener('change', updatePrintHeader);
  });



    const _sb = $('saveBaseline');
  if(_sb){
    _sb.addEventListener('click', ()=>{
      saveToLocal('ogtt_fresh_baseline', snapshot());
      toast('Baseline saved');
    });
  }

$('clear').addEventListener('click', ()=>{
    localStorage.removeItem('ogtt_fresh_current');
    document.querySelectorAll('input').forEach(i=>{ if(i.type==='checkbox') i.checked=false; else i.value=''; });
    document.querySelectorAll('select').forEach(s=>{ if(s.id==='unitMode') return; s.value=''; });
    render();
    toast('Cleared');
  });
}

(function init(){
  // Auto-clear on reload
  try{ localStorage.removeItem('ogtt_fresh_current'); }catch(e){}

  // load (disabled: auto-clear on reload)
// default
  state.unitMode = $('unitMode').value || state.unitMode;
  updateUnitLabels();

  wire();
  render();
})();


// --- navigation + build stamp helpers (merged into site.js) ---
(function setActiveNav(){
  try{
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.nav-links a').forEach(a=>{
      const href = (a.getAttribute('href') || '').toLowerCase();
      if(href === path) a.setAttribute('aria-current','page');
    });
  }catch(e){}
})();

(function buildStamp(){
  const BUILD_ID = 'v5-2026-02-02.1';
  try{
    console.log('OGTT site build:', BUILD_ID);
    const footer = document.querySelector('.footer') || document.querySelector('.site-footer') || document.querySelector('.footerNote:last-of-type');
    if(footer && !footer.querySelector('[data-build]')){
      const s = document.createElement('div');
      s.setAttribute('data-build','1');
      s.style.marginTop = '6px';
      s.style.opacity = '0.85';
      s.style.fontSize = '12px';
      s.textContent = 'Build ' + BUILD_ID;
      footer.appendChild(s);
    }
  }catch(e){}
})();

function toggleAllAccordions(open){
  document.querySelectorAll('details.accordion').forEach(d=> d.open = !!open);
}
