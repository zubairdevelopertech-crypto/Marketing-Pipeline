const { callClaudeJSON } = require('../utils/claude');
const { generateImage } = require('../utils/gemini');
const { saveManifest, uploadImageToStorage, getBrandAssetPaths, getManifestAsync } = require('../utils/db');
const fs = require('fs');
const path = require('path');

// Reference images folder — winning ad examples per format
const REFS_DIR = path.join(__dirname, '..', '..', '00 — Winning Static References');

// ─── Reference image mapping (exact filenames in winning references folder) ───
// Version A = first file, Version B = second file
const FORMAT_REFERENCE_FILES = {
  'FORMAT-01': ['PAS1.png', 'PAS2.png'],
  'FORMAT-02': ['BAB_1.png', 'BAB_2.png'],
  'FORMAT-03': ['Social Proof_1.png'],
  'FORMAT-04': ['Direct Offer_1.png', 'Direct Offer_2.png'],
  'FORMAT-05': ['Listicle_1.png', 'Listicle_2.png'],
  'FORMAT-06': ['Question Hook_1.png', 'Question Hook_2.png'],
  'FORMAT-07': ['Comparison_1.png', 'Comparison_2.png'],
  'FORMAT-08': ['Result First_1.png', 'Result First_2.png'],
  'FORMAT-09': ['Empathy_1.png', 'Empathy_2.png'],
  'FORMAT-10': ['Bold Statement_1.png', 'Bold Statement_2.png'],
  'FORMAT-11': ['Sticky Note_1.png', 'Sticky Note_2.png'],
  'FORMAT-12': ['iPhone Notes_!.png', 'iPhone Notes_2.png'],
  'FORMAT-13': ['iMessage Conversation1.png', 'iMessage Conversation2.png'],
  'FORMAT-14': ['ChatGPT Ad_1.png', 'ChatGPT Ad_1.jpg'],
  'FORMAT-15': ['Us vs Them_1.jpg', 'Us vs Them_2.png'],
  'FORMAT-16': ['Benefit Callout_1.png', 'Benefit Callout_2.png'],
  'FORMAT-17': ['UGC Static1.png', 'UGC Static2.png'],
  'FORMAT-18': ['Cartoon Style_1.png', 'Cartoon Style_2.png'],
  'FORMAT-19': ['Lifestyle Context_1.png', 'Lifestyle Context2.png'],
  'FORMAT-20': ['Carousel Ad1.png', 'Carousel Ad_2.png'],
  'FORMAT-21': ['Add Review1.png', 'Add Review2.png'],
  'FORMAT-22': [], // no reference — use text rules only
};

// Returns ALL reference images for a format (up to 2)
// Gemini supports up to 14 reference images — passing both helps it
// understand the FORMAT PATTERN rather than copying one specific example
function getAllReferenceImages(formatId) {
  const files = FORMAT_REFERENCE_FILES[formatId] || [];
  return files
    .map(f => path.join(REFS_DIR, f))
    .filter(p => fs.existsSync(p));
}

// ─── Format visual rules (based on actual winning reference images) ───
// Each description tells Claude EXACTLY what the format looks like so
// it can write a precise Gemini prompt. The reference image is also passed.
const FORMAT_VISUAL_RULES = {
  'FORMAT-01': {
    name: 'PAS',
    composition: 'Dark moody background, dramatic lighting. The ad is divided into three vertical sections reading top to bottom. At the top: a small coloured label "Probleem:" followed by a large bold pain headline. In the middle: a small coloured label "Agiteer:" followed by the agitation consequence text. A stressed frustrated person is visible on the left side throughout all sections. At the bottom: product displayed alongside the solution text. A full-width CTA button bar anchors the very bottom. Overall feel: cinematic, high-contrast, urgent.',
    mustInclude: ['three labeled zones (Problem/Agitate/Solution visible)', 'suffering/frustrated person', 'product shown in the solution zone', 'dark dramatic background', 'bold CTA bar at bottom'],
    mustExclude: ['split left/right composition', 'clean white backgrounds', 'star ratings', 'chat bubbles', 'comparison tables']
  },
  'FORMAT-02': {
    name: 'BAB',
    composition: 'SIDE-BY-SIDE TWO-PHOTO LAYOUT. LEFT photo: person in current bad situation (stressed, frustrated, "before" state) — label "Hoe het begon" or "VOOR". RIGHT photo: same type of person in transformed state (confident, successful, "after" state) — label "Hoe het nu gaat" or "NA". Both photos authentic, real-looking. Minimal design — the contrast between the two photos IS the message. Clean simple typography for labels only.',
    mustInclude: ['two equal side-by-side photos', 'before label on left photo', 'after label on right photo', 'authentic real-looking photos (not overly polished)', 'visible transformation between the two states'],
    mustExclude: ['table comparisons', 'floating review cards', 'dark/moody overall tone', 'product as main focus', 'diagonal splits with arrows']
  },
  'FORMAT-03': {
    name: 'Social Proof',
    composition: 'PERSON-CENTERED PROOF LAYOUT. Central person (smiling, professional) holding a laptop or product. Floating proof elements surround them: star rating badge ("4.8/5 ★"), specific number callout ("Trusted by 40+ klanten"), mini testimonial speech bubbles, checkmark icons, growth chart icon. Bold "Trusted by [NUMBER]+" headline at the very top in large display type. CTA button at the bottom in brand color. Everything feels like verified credibility stacking.',
    mustInclude: ['central person with laptop/product', 'large "Trusted by X+" or "40+ klanten" headline', 'floating star rating badge', 'multiple proof elements (testimonial bubbles, checkmarks, numbers)', 'CTA button at bottom'],
    mustExclude: ['split before/after compositions', 'dark dramatic scenes', 'sticky notes', 'chat UI elements', 'table comparisons']
  },
  'FORMAT-04': {
    name: 'Direct Offer',
    composition: 'BOLD OFFER SPLIT LAYOUT. Two-tone background (brand color on one side, accent on other). Brand logo large at TOP center. The core offer framed as a two-outcome guarantee: "NO [PROBLEM] OR YOUR MONEY BACK" — in very large bold display type dominating the center. Product displayed prominently in the middle. Emojis optional for emphasis. Clean, punchy, direct. Everything points to the irresistible offer.',
    mustInclude: ['large brand logo at top', 'two-tone split background', 'bold guarantee/offer statement as hero text', 'product center', 'outcome OR money-back framing'],
    mustExclude: ['before/after photos', 'table comparisons', 'chat UI', 'excessive copy text', 'moody dark photography']
  },
  'FORMAT-05': {
    name: 'Listicle',
    composition: 'PHONE MOCKUP WITH CHECKLIST. An iPhone/smartphone mockup shows a checklist/app UI on the screen. Inside the phone screen: bold headline ("Why Everyone Is [Action]"), star rating, a labeled list section with 3-5 bullet points with emoji icons. The physical product leans AGAINST the phone mockup. This creates a layered scene: product + phone showing the benefits list. CTA button at the bottom of the real ad frame.',
    mustInclude: ['smartphone/iPhone mockup showing checklist inside screen', 'product physically leaning against the phone', 'numbered or bulleted list visible on phone screen with icons', 'clean white/light product background', 'CTA button below the phone'],
    mustExclude: ['table format', 'dark backgrounds', 'before/after split', 'chat bubbles', 'testimonial cards floating']
  },
  'FORMAT-06': {
    name: 'Question Hook',
    composition: 'SPLIT: PRODUCT LEFT + QUESTION RIGHT. Left half: product image on solid bright background (brand color). Right half: same bright background, large bold provocative question as the hero element ("What to Do When [Common Advice] No Longer Works?"), short 2-line body text below answering the question, CTA button at bottom. The question takes up most of the right side. Minimal, editorial, native-content feeling.',
    mustInclude: ['product on left side', 'large bold question on right side taking majority of space', 'short body text answering the question', 'bright solid background', 'CTA button'],
    mustExclude: ['dark/moody background', 'before/after panels', 'floating review cards', 'phone mockups', 'table layouts']
  },
  'FORMAT-07': {
    name: 'Comparison',
    composition: 'CLEAN TABLE COMPARISON. White or very light background. Brand logo at TOP. Large bold headline: "Comparison of [Our Approach] vs [Old Way]". Below: a structured table/grid with colored column headers (brand color for our column, neutral/gray for competitor). 3-5 data rows comparing specific metrics with actual numbers. Footer bar in brand color with website/CTA. Feels like an infographic, not an ad.',
    mustInclude: ['brand logo at top', 'comparison headline', 'structured table with colored column headers', 'specific data/numbers in rows', 'footer CTA bar in brand color'],
    mustExclude: ['lifestyle photography', 'dark backgrounds', 'person photos', 'review cards', 'split photo layouts']
  },
  'FORMAT-08': {
    name: 'Result First',
    composition: 'WHITE ROUNDED CARD with PRODUCT OVERLAP. Soft pastel or gradient background. A large white rounded rectangle card (like a UI card) sits center. Inside the card: bold specific result as HUGE headline ("Clearer Skin in 7 Days" / "€10K/maand in 30 Dagen"), short "How" explanation below with 3 brief bullet points. The product photo OVERLAPS the card (sits on top, leaning or popping out). CTA button and aggregate rating at the very bottom of the ad.',
    mustInclude: ['large white rounded card as central element', 'specific result as huge headline inside card', 'brief how/bullet points inside card', 'product photo overlapping/popping out of the card', 'CTA + aggregate review rating at bottom'],
    mustExclude: ['dark backgrounds', 'side-by-side layouts', 'floating testimonial bubbles', 'chat UI', 'table comparisons']
  },
  'FORMAT-09': {
    name: 'Empathy',
    composition: 'Soft light background, calm aesthetic. An elegant arch or oval frame shape is the main design element. Inside the arch: empathy headline that starts with understanding the reader\'s pain, followed by a softer explanatory sentence, then a brief "Here is why" explanation. Product shown subtly near the bottom of the arch. A CTA below. The overall mood is gentle, understanding, non-aggressive — like a trusted expert speaking to you.',
    mustInclude: ['arch or rounded oval frame as design element', 'empathy statement headline starting with understanding', 'soft light pastel background (not dark)', 'product shown subtly inside or below arch', 'calm sophisticated typography'],
    mustExclude: ['dark dramatic backgrounds', 'bold aggressive headlines', 'split before/after', 'floating review cards', 'table layouts']
  },
  'FORMAT-10': {
    name: 'Bold Statement',
    composition: 'PRODUCT-HERO with RADIATING BENEFIT CALLOUTS. The product is placed CENTER of the image. Benefit callouts with arrows radiate FROM the product in all directions (like a spoke-and-wheel layout): short bold claims pointing at the product from top-left, top-right, bottom-left, bottom-right ("Sugar Free ←", "Zero Calories ←"). Bold headline at TOP of image. Price/offer statement at BOTTOM. Light or colored solid background.',
    mustInclude: ['product centered as hero element', 'benefit callouts with arrows radiating from product toward edges', 'bold claim headline at top', 'price or offer statement at bottom', 'light solid background'],
    mustExclude: ['dark moody backgrounds', 'person photos as main element', 'side-by-side splits', 'table comparisons', 'phone mockups']
  },
  'FORMAT-11': {
    name: 'Sticky Note',
    composition: 'REAL-WORLD PRODUCT PHOTO with PHYSICAL STICKY NOTES. An authentic, slightly casual photo of the product or package in a natural real-world setting (not a studio). Physical sticky notes (colored — blue, yellow, green, pink) are placed ON or NEXT TO the product in the photo. The sticky notes have handwritten-style or casual sans-serif text with key product benefits or a personal message. Feels organic, unscripted, like an unboxing moment.',
    mustInclude: ['authentic casual product photo (not studio)', 'physical sticky notes visible with handwritten-style text', 'notes placed on or directly beside product', 'casual natural setting', 'key benefit or message on each sticky note'],
    mustExclude: ['polished studio photography', 'digital text overlays replacing sticky notes', 'dark backgrounds', 'table layouts', 'person portrait as main subject']
  },
  'FORMAT-12': {
    name: 'iPhone Notes',
    composition: 'PIXEL-PERFECT iPHONE NOTES APP SCREENSHOT. The entire ad IS a screenshot of the iPhone Notes app. Status bar at top (time + wifi + battery icons). "Notes" navigation header. Date/time stamp below header. Bold question or statement as the NOTE TITLE. Body: 3-4 checkmarked list items with emoji icons. Product photo overlaid in the bottom-right corner of the note. Promotional flash-sale or CTA banner at the very bottom of the screen. Must look like a real screenshot.',
    mustInclude: ['exact iPhone Notes app UI (status bar, Notes header, date)', 'bold question or statement as note title', 'checkmarked list items with emoji', 'product photo overlaid in corner of note', 'CTA or promotional banner at very bottom'],
    mustExclude: ['dark mode (use light Notes app)', 'any design that looks like a designed ad', 'table layouts', 'lifestyle photography', 'split compositions']
  },
  'FORMAT-13': {
    name: 'iMessage',
    composition: 'iPHONE SHOWING iMESSAGE CONVERSATION at a slight angle. The iPhone is held or displayed at a slight tilt (not perfectly flat). The iMessage conversation is fully visible: "Someone leaked this chat..." as the opener, then a conversation with blue sent-bubbles and gray received-bubbles. The conversation naturally reveals the product or result. Product thumbnail visible at bottom. Social media engagement numbers (❤️ 1.2k, shares) visible for viral feel. Bold CTA text at very bottom below phone.',
    mustInclude: ['iPhone shown at a slight angle', 'iMessage UI with blue and gray chat bubbles', 'hook text at top ("Someone leaked this chat..." or similar)', 'organic conversation revealing the product or result', 'CTA text below the phone'],
    mustExclude: ['flat top-down phone view', 'designed graphic overlays', 'split layouts', 'star ratings', 'table comparisons']
  },
  'FORMAT-14': {
    name: 'ChatGPT Ad',
    composition: 'FULL DESKTOP CHATGPT INTERFACE. The ad shows the complete ChatGPT web interface (light mode preferred). Left sidebar visible with conversation list. Main chat area: a user prompt asking a relevant question at the top, and the AI response below in numbered/bullet format answering something directly relevant to the product value. The interface is shown inside a subtle device frame or with a light blue background around it. Brand elements are minimal overlays.',
    mustInclude: ['full ChatGPT desktop UI (not mobile)', 'left sidebar with conversation list visible', 'user question prompt visible', 'AI numbered response visible', 'light mode preferred'],
    mustExclude: ['mobile app version', 'phone mockups', 'split layouts', 'person photos', 'star ratings on cards']
  },
  'FORMAT-15': {
    name: 'Us vs Them',
    composition: 'BOLD "US VS. THEM" SPLIT. The ad is divided into two clearly colored halves. "US VS." in giant bold text on one side (cream/light background), "THEM" in giant bold text on the other side (contrasting color — yellow/orange/red). Each side shows: the product/approach photo, then specific comparison stats below (calories, price, features with actual numbers). Clean, factual, decisive. The visual difference between the sides IS the message.',
    mustInclude: ['"US VS." and "THEM" or equivalent in huge bold text', 'two distinctly colored background halves', 'product or approach shown on each side', 'specific comparison stats/numbers below each side', 'clear winner indicated through visual hierarchy'],
    mustExclude: ['table layout with rows', 'dark backgrounds', 'person portrait focus', 'review cards', 'phone mockups']
  },
  'FORMAT-16': {
    name: 'Benefit Callout',
    composition: 'NUMBERED BENEFIT LIST + PRODUCT PHOTO. Clear headline at TOP: "[Number] Benefits/Redenen van [Product]:" or "Waarom [audience] kiezen voor [product]:". Below headline: numbered list (1. 2. 3. 4. 5.) with short bold benefit statements. Product photo placed prominently on the RIGHT side of the list, or at center-bottom. Colorful gradient background (not plain white). Feels like a listicle-infographic hybrid.',
    mustInclude: ['"X Benefits/Redenen van [Product]:" as headline structure', 'numbered list (1-5) of specific benefits', 'product photo on right or center', 'colorful gradient background', 'clean numbered list typography'],
    mustExclude: ['dark backgrounds', 'before/after splits', 'floating testimonial bubbles', 'phone mockups', 'table grid comparisons']
  },
  'FORMAT-17': {
    name: 'UGC Static',
    composition: 'AUTHENTIC USER-GENERATED CONTENT STYLE. Real-looking person in an authentic everyday setting (gym locker room, bathroom, kitchen — NOT a studio). Person holds or uses the product naturally. TEXT OVERLAY in casual bold white type (lower-thirds style): first line = catchy honest statement ("didn\'t expect results this fast tbh"), second line = supporting detail ("been using it daily for 2 weeks"). CTA button (pill shape, brand color). SOCIAL MEDIA HANDLE visible at bottom (@username · posted 2h ago).',
    mustInclude: ['authentic real-world setting (not studio)', 'person naturally holding/using product', 'casual first-person text overlay in lower-thirds style', 'social media username/handle at bottom', 'CTA button'],
    mustExclude: ['studio photography', 'polished designed layout', 'table comparisons', 'split before/after', 'floating review cards stacked']
  },
  'FORMAT-18': {
    name: 'Cartoon Style',
    composition: 'FLAT 2D ILLUSTRATION STYLE. The entire ad is illustrated — no photography. Flat, clean illustration style with bold outlines and solid or slightly textured colors. Shows an illustrated character or scene relevant to the product benefit. Can include multiple small scene thumbnails arranged in a grid. Brand logo and URL text in branded illustrated style. Feels like animation stills or a motion graphic frame.',
    mustInclude: ['entirely illustrated (no photography)', 'flat 2D cartoon characters or scenes', 'bold outlines, solid colors', 'brand name/URL in illustrated style', 'clean simple illustrated background'],
    mustExclude: ['any photography or realistic rendering', 'dark moody aesthetics', 'phone mockups', 'before/after splits', 'review card overlays']
  },
  'FORMAT-19': {
    name: 'Lifestyle Context',
    composition: 'PREMIUM LIFESTYLE PHOTOGRAPHY with MINIMAL TEXT OVERLAY. Full-bleed aspirational lifestyle photo: person actively using the product or in an aspirational scene related to the outcome (running, working freely from laptop, standing confidently in a city). Brand logo + tagline in clean minimal typography overlaid. Very minimal text — the visual IS the message. Product or service integrates naturally into the scene. Premium, editorial, Nike-ad quality.',
    mustInclude: ['premium aspirational lifestyle photo (full-bleed)', 'person actively in the aspirational situation', 'product or service naturally integrated', 'minimal text overlay (logo + tagline only)', 'premium editorial photography quality'],
    mustExclude: ['heavy text overlays', 'table comparisons', 'phone mockups', 'floating review cards', 'split before/after layouts']
  },
  'FORMAT-20': {
    name: 'Carousel Ad',
    composition: 'VERTICALLY STACKED STORY PANELS showing the carousel progression. The ad shows multiple content panels stacked: TOP panel = bold hook question ("Why am I still not [achieving result]?") with dramatic background photo. Below: 2-3 narrower panels each showing a step in the story (photo + short explanation + "Before → After" label). BOTTOM panel = CTA with product and "Start your [transformation] today" + "SHOP NOW →". The overall ad tells a progressive story from problem to solution.',
    mustInclude: ['hook question panel at top with dramatic photo', '2-3 story progression panels below with photos + text', 'before → after label on story panels', 'product + CTA panel at very bottom', 'progressive narrative structure visible'],
    mustExclude: ['single-panel layout', 'side-by-side splits', 'phone mockups', 'table comparisons', 'cartoon style']
  },
  'FORMAT-21': {
    name: 'Review',
    composition: 'DRAMATIC PHOTO + FLOATING REVIEW CARD. Full-bleed dramatic or authentic background photo (person in relevant setting — gym, mirror selfie, real environment). Bold problem-statement headline overlaid at TOP ("Why Is [Problem] Not Going Away?" or "Training Hard But Still Not [Result]?"). A FLOATING REVIEW CARD overlaid on the photo: white card with ★★★★★ stars, specific verified testimonial quote with person name ("— Sarah M."). Aggregate rating at very bottom ("4.8★ from 12,000+ reviews"). CTA button.',
    mustInclude: ['dramatic or authentic real-life background photo', 'bold problem/agitation headline at top', 'floating white review card with ★★★★★ and specific quote', 'person name on review (e.g. "— Sarah M.")', 'aggregate rating at bottom', 'CTA button'],
    mustExclude: ['clean studio product shots', 'table comparisons', 'phone mockups', 'split before/after panels', 'cartoon style']
  },
  'FORMAT-22': {
    name: 'Negative/Positive',
    composition: 'RED-GREEN CONTRAST SPLIT. LEFT half: red/dark tones, ✗ marks, frustrated person or negative situation spelled out, text describing the negative current reality. RIGHT half: green/bright tones, ✓ checkmarks, positive outcome or aspirational situation, text describing the positive result after using the product. Bold typography on both sides. Clear contrast in colors (red = bad, green = good). Simple, direct, high-impact.',
    mustInclude: ['left side red/dark tones with ✗ marks', 'right side green/bright tones with ✓ checkmarks', 'negative current situation text on left', 'positive outcome text on right', 'strong color contrast between halves'],
    mustExclude: ['neutral color palette', 'person portrait as main focus', 'phone mockups', 'table comparisons', 'review cards']
  }
};

function getFormatRules(formatId) {
  return FORMAT_VISUAL_RULES[formatId] || {
    composition: 'Clean, high-contrast layout with the headline as the dominant element. Brand colors throughout. CTA button at bottom.',
    mustInclude: ['clear headline hierarchy', 'brand colors', 'CTA button'],
    mustExclude: ['cluttered layout', 'multiple competing focal points']
  };
}

async function runCreative(clientDir, briefs, context, onProgress, skipImages = false, ratios = ['4:5']) {
  const clientSlug = path.basename(clientDir);
  const outputDir = path.join(clientDir, 'output');
  const imagesDir = path.join(outputDir, 'images');
  const promptsDir = path.join(outputDir, 'prompts');
  const manifestPath = path.join(outputDir, 'creative_manifest.json');
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(promptsDir, { recursive: true });

  // Load client brand assets once (product photos, logos) — passed as extra Gemini references
  const brandAssets = getBrandAssetPaths(clientSlug).slice(0, 5);
  if (brandAssets.length > 0) {
    onProgress({ step: 'creative', status: 'running', message: `🖼️ Found ${brandAssets.length} brand asset${brandAssets.length > 1 ? 's' : ''} — will use as visual reference for all ads` });
  }

  // Validate ratios — only accept supported values
  const validRatios = [...new Set(ratios.filter(r => ['4:5', '1:1', '9:16'].includes(r)))];
  if (!validRatios.length) validRatios.push('4:5');

  // ── CRITICAL: Load existing manifest so we never lose previously generated images ──
  // Filesystem first — if missing (cloud server restart), fall back to Supabase DB.
  // This guarantees previously generated images are always preserved across runs.
  let existingManifest = [];
  if (fs.existsSync(manifestPath)) {
    try { existingManifest = JSON.parse(fs.readFileSync(manifestPath)); } catch (_) {}
  }
  if (existingManifest.length === 0) {
    // Local file missing or empty — load from DB so we don't lose cloud-stored images
    try {
      const dbManifest = await getManifestAsync(clientSlug);
      if (dbManifest?.length) {
        existingManifest = dbManifest;
        onProgress({ step: 'creative', status: 'running', message: `📂 Loaded ${dbManifest.length} previously generated creatives from database — merging with new run` });
      }
    } catch (_) {}
  }
  const mergedResults = [...existingManifest]; // start with ALL existing creatives

  const validBriefs = briefs.filter(b => !b.error);
  const total = validBriefs.length * validRatios.length;
  let count = 0;

  onProgress({
    step: 'creative',
    status: 'running',
    message: `🎨 Generating ${total} creatives — ${validBriefs.length} formats × ${validRatios.length} ratio${validRatios.length > 1 ? 's' : ''} (${validRatios.join(', ')})${brandAssets.length > 0 ? ` + ${brandAssets.length} brand assets` : ''}...`
  });

  for (const brief of validBriefs) {
    for (const ratio of validRatios) {
    count++;
    // 4:5 uses legacy label (no suffix) for backward compatibility; other ratios add suffix
    const ratioSuffix = ratio === '4:5' ? '' : `-${ratio.replace(':', 'x')}`;
    const label = `${brief.format_id}-VERSION-${brief.version}${ratioSuffix}`;

    onProgress({
      step: 'creative',
      status: 'running',
      message: `🖼️  [${count}/${total}] ${label} — Building image prompt...`,
      progress: { current: count, total, bar: 'creative' },
      imageStatus: { label, status: 'building_prompt', index: count, total }
    });

    const result = { label, format_id: brief.format_id, version: brief.version, ratio, brief, status: 'pending' };

    try {
      const imagePrompt = await generateImagePrompt(brief, context, { ratio, brandAssets });

      const promptPath = path.join(promptsDir, `${label}.json`);
      fs.writeFileSync(promptPath, JSON.stringify(imagePrompt, null, 2));
      result.prompt = imagePrompt;
      result.prompt_path = promptPath;

      if (skipImages) {
        result.status = 'prompt_only';
        onProgress({
          step: 'creative', status: 'running',
          message: `   ⏭️  ${label} — Prompt saved (skip-images mode)`,
          imageStatus: { label, status: 'prompt_only', index: count, total }
        });
      } else {
        onProgress({
          step: 'creative', status: 'running',
          message: `   🍌 [${count}/${total}] ${label} — Generating image...`,
          imageStatus: { label, status: 'generating', index: count, total }
        });

        // Pass format reference images first (layout structure), then brand assets (actual product)
        const refImages = getAllReferenceImages(brief.format_id);
        const allRefs   = [...refImages, ...brandAssets]; // Gemini sees format refs, then brand images
        if (allRefs.length > 0) {
          onProgress({
            step: 'creative', status: 'running',
            message: `   📐 [${count}/${total}] ${label} — ${refImages.length} format ref${refImages.length !== 1 ? 's' : ''}${brandAssets.length > 0 ? ` + ${brandAssets.length} brand asset${brandAssets.length > 1 ? 's' : ''}` : ''} · ratio ${ratio}`,
            imageStatus: { label, status: 'generating', index: count, total }
          });
        }

        let attempt = 0;
        const imageBytes = await generateImage(imagePrompt.nano_banana_prompt, allRefs, {
          retries: 3,
          aspectRatio: ratio,
          onRetry: (att, total, errorCode, delaySec) => {
            attempt = att;
            onProgress({
              step: 'creative', status: 'running',
              message: `   ⏳ [${count}/${total}] ${label} — Gemini busy, retrying (${att}/3) in ${delaySec}s...`,
              imageStatus: { label, status: 'retrying', attempt: att, maxRetries: 3, delaySec, index: count, total }
            });
          }
        });

        const imagePath = path.join(imagesDir, `${label}.jpg`);
        fs.writeFileSync(imagePath, imageBytes);

        result.image_path = imagePath;
        // Try to upload to Supabase Storage for Vercel-compatible persistent URL
        const storageUrl = await uploadImageToStorage(clientSlug, label, imageBytes);
        result.image_url = storageUrl || `/api/creatives/${clientSlug}/images/${label}.jpg`;
        result.status = 'success';

        onProgress({
          step: 'creative', status: 'running',
          message: `   ✅ [${count}/${total}] ${label} — Image saved`,
          imageStatus: { label, status: 'success', image_url: result.image_url, index: count, total }
        });
      }
    } catch (e) {
      result.status = 'error';
      result.error = e.message;
      onProgress({
        step: 'creative', status: 'running',
        message: `   ❌ [${count}/${total}] ${label} — Failed after all retries: ${e.message.slice(0, 100)}`,
        imageStatus: { label, status: 'error', error: e.message, index: count, total }
      });
    }

    // Merge: update existing entry for this label, or append if new
    const existingIdx = mergedResults.findIndex(r => r.label === label);
    if (existingIdx !== -1) {
      mergedResults[existingIdx] = result;
    } else {
      mergedResults.push(result);
    }

    await saveManifest(clientSlug, mergedResults);

    await new Promise(r => setTimeout(r, 2000));
    } // end ratio loop
  } // end brief loop

  const successful = mergedResults.filter(r => r.status === 'success').length;
  const total_stored = mergedResults.length;
  onProgress({
    step: 'creative',
    status: 'done',
    message: `✅ ${successful}/${total_stored} creatives ready (${total} generated this run)`,
    progress: { current: total, total, bar: 'creative' }
  });

  return mergedResults;
}

// Version A/B scene differentiation — same FORMAT, completely different visual execution
const VERSION_SCENE_VARIANTS = {
  A: {
    mood: 'professional, data-driven, precise, authoritative',
    setting: 'clean modern office, minimal desk setup, or corporate environment with real depth',
    person: 'professionally dressed person, early 30s, natural confidence — NOT model-perfect, real human features with natural skin texture',
    palette: 'cool professional tones, brand primary color dominant, structured layout',
    typography: 'geometric sans-serif (Inter or Helvetica Neue style), weight 700, tight tracking',
    lighting: 'soft studio strobe with large diffuser, slight shadow on one side for dimension — NOT flat even illumination',
    unique: 'Version A leans rational: specific numbers, credentials, precise visual hierarchy. Shot feel: Sony A7R IV, 35mm f/2.8, controlled studio light.'
  },
  B: {
    mood: 'personal, emotional, aspirational, authentic, human',
    setting: 'outdoor golden hour, canal-side in a European city, warm cafe interior, or home office with natural window light',
    person: 'casually dressed, relaxed posture, candid authentic expression — genuine emotion, slight imperfection, NOT posed',
    palette: 'warm amber and soft tones, lifestyle-feeling, brand color as accent only',
    typography: 'humanist sans-serif (DM Sans or Plus Jakarta Sans style), slightly more breathing room, can include one handwritten accent word',
    lighting: 'outdoor golden hour ambient OR warm window light from the side — cinematic, directional, with natural bokeh background',
    unique: 'Version B leans emotional: identity shift, personal story, aspirational freedom. Shot feel: Fujifilm X-T5, 50mm f/1.4, natural ambient light with film character.'
  }
};

// Per-ratio safe zone and dimension specs for Meta ads
const RATIO_SPECS = {
  '4:5': {
    dimensions: '1080×1350px',
    name: 'Feed (portrait)',
    safeZone: 'horizontal 8-92%, vertical 12-82%. CTA at 65-80% from top. Bottom 18% and top 12% are DANGER ZONES — Meta overlays UI here. Keep bottom 18% as atmospheric background only.',
  },
  '1:1': {
    dimensions: '1080×1080px',
    name: 'Feed (square)',
    safeZone: 'horizontal 8-92%, vertical 10-90%. CTA at 60-78% from top. Keep all edges clear with 8% margin. Equal visual weight expected on all sides.',
  },
  '9:16': {
    dimensions: '1080×1920px',
    name: 'Reels / Stories',
    safeZone: 'VERY RESTRICTIVE — horizontal 6-94%, vertical 14-65% ONLY. Bottom 35% is a DANGER ZONE (Instagram shows likes, comments, captions here). Top 14% is a DANGER ZONE. ALL text and CTAs must be packed into the middle 51% of height. Keep composition tight and centered vertically.',
  },
};

async function generateImagePrompt(brief, context, { ratio = '4:5', brandAssets = [] } = {}) {
  const isNL = context.target_audience?.location?.toLowerCase().includes('netherlands') ||
               context.target_audience?.location?.toLowerCase().includes('nederland');
  const lang = isNL ? 'Dutch (Nederlands)' : 'English';

  const rules = getFormatRules(brief.format_id);
  const versionScene = VERSION_SCENE_VARIANTS[brief.version] || VERSION_SCENE_VARIANTS.A;
  const ratioSpec = RATIO_SPECS[ratio] || RATIO_SPECS['4:5'];

  const prompt = `You are a world-class Meta ad creative director. Generate a production-ready image prompt for Gemini image generation.

IMPORTANT: The nano_banana_prompt field you write is sent DIRECTLY to Gemini which generates a pixel image. Any label or annotation you write — like "(TOP-RIGHT)", "(MIDDLE)", "(BOTTOM)", "80px", "ZONE 1", "Section A" — will be LITERALLY PAINTED into the image as visible text. Write only cinematic scene descriptions. Never include any layout labels, position annotations, pixel values, zone numbers, or bracketed technical instructions.

CLIENT: ${context.client_name}
PRODUCT: ${context.product_name}
TONE: ${context.tone_of_voice}
BRAND PRIMARY COLOR: ${context.brand_primary_color || '#2563EB'}
BRAND SECONDARY COLOR: ${context.brand_secondary_color || '#FFFFFF'}
LOGO: Top-right corner, white version on dark backgrounds
ALL TEXT ON THE VISUAL MUST BE IN: ${lang}

CONTENT BRIEF:
Format: ${brief.format_id} — ${brief.format_name} — Version ${brief.version}
Hook: ${brief.hook_line}
Headline: ${brief.headline}
Subheadline: ${brief.subheadline}
Body copy: ${brief.body_copy}
CTA: ${brief.cta_text}
Winning argument: ${brief.winning_argument}

═══════════════════════════════════════════════
FORMAT-SPECIFIC VISUAL REQUIREMENTS — MANDATORY
This format (${brief.format_id}) has strict layout rules that MUST be followed.
The visual must be STRUCTURALLY DIFFERENT from other format types.

REQUIRED COMPOSITION:
${rules.composition}

MUST INCLUDE (all of these):
${rules.mustInclude.map(r => `• ${r}`).join('\n')}

MUST EXCLUDE (none of these allowed):
${rules.mustExclude.map(r => `• ${r}`).join('\n')}
═══════════════════════════════════════════════

TEXT ON VISUAL — keep it SHORT and HIGH IMPACT:
• Headline: "${brief.headline}" (MAX 6 words — bold, large)
• Subheadline: "${brief.subheadline}" (MAX 10 words — supporting)
• CTA button: "${brief.cta_text}" (on brand-color button)
• Body copy on image: Use MAXIMUM 2 lines only. The full body copy goes in the ad caption, NOT all on the visual.

Return ONLY valid JSON:
{
  "format_name": "${brief.format_name}",
  "version": "${brief.version}",
  "ratio": "${ratio}",
  "dimensions": "${ratioSpec.dimensions}",
  "headline": "${brief.headline}",
  "subheadline": "${brief.subheadline}",
  "body_copy": "${brief.body_copy}",
  "cta_text": "${brief.cta_text}",
  "visual_direction": "Detailed scene description matching the mandatory composition above",
  "mood": "professional/warm/urgent/aspirational/empathetic",
  "brand_primary_color": "${context.brand_primary_color || '#2563EB'}",
  "brand_secondary_color": "${context.brand_secondary_color || '#FFFFFF'}",
  "logo_placement": "top-right",
  "nano_banana_prompt": "MISSION: Produce a real, professional Meta ad that could run tomorrow — created by a top-tier agency like Wieden+Kennedy or Droga5. Every element must feel intentional and human-made, NOT AI-generated.\\n\\n⚠️ ABSOLUTE RULE: NEVER include position labels, pixel values, zone numbers, or bracketed technical annotations — Gemini paints them literally as text on the image. Write ONLY cinematic visual descriptions.\\n\\n📐 META SAFE ZONE for ${ratioSpec.name} (${ratioSpec.dimensions}): ${ratioSpec.safeZone}\\n\\n${brandAssets.length > 0
    ? `🖼️ CLIENT BRAND ASSETS: The last ${brandAssets.length} reference image(s) passed to Gemini are the client's OWN product photos / brand imagery. USE THEM DIRECTLY — feature the actual product, show the real brand imagery. The first reference image(s) are format layout examples (structure only).`
    : 'REFERENCE IMAGES: Format layout examples are attached — study structure only, create new content.'
  }\\n\\nCOMPOSITION (${brief.format_name}): ${rules.composition}\\n\\nVERSION ${brief.version} IDENTITY: ${versionScene.mood} mood. ${versionScene.setting}. ${versionScene.person}. Palette: ${versionScene.palette}. Lighting: ${versionScene.lighting || 'natural, directional, with clear shadow and highlight separation'}.\\n\\n🎨 REALISM MANDATE — This must NOT look AI-generated:\\n• People: natural skin texture with visible pores, genuine candid expression, slight natural imperfections — NOT plastic skin, NOT model-perfect, NOT uncanny valley face. Real human proportions.\\n• Photography: directional lighting creating depth and shadow — NOT flat even illumination that screams AI. Real bokeh behind subjects.\\n• Environment: authentic setting with real texture and depth — NOT AI-smoothed uniform backgrounds.\\n• Design elements (cards, buttons, tables): pixel-perfect sharp edges, precisely aligned — Figma/Photoshop quality, NOT blurry or floaty.\\n• Text: every word must be perfectly legible, real font — NOT garbled/blurry AI-generated letterforms.\\n• Composition: slightly asymmetric and dynamic — NOT perfectly centered, NOT robotically symmetric.\\n\\n❌ BANNED: plastic-looking faces, uncanny valley expressions, floating disconnected UI elements, perfectly symmetric compositions, blurry unreadable text, flat even AI-style lighting, generic stock photo feel, default AI gradient backgrounds.\\n\\nTEXT on the image (${lang}, bold and legible, inside safe zone):\\n• Headline: \\"${brief.headline}\\"\\n• Subheadline: \\"${brief.subheadline}\\"\\n• CTA button in ${context.brand_primary_color || '#2563EB'}: \\"${brief.cta_text}\\"\\n\\nBRAND: '${context.client_name}' logo placed with clear margin. Primary color: ${context.brand_primary_color || '#2563EB'}.\\n\\nFINAL QUALITY CHECK: A real art director should look at this and say 'a human made this' — intentional, raw where appropriate, polished where needed, emotionally resonant.\\n\\nDO NOT INCLUDE: ${rules.mustExclude.join(', ')}."
}`;

  return await callClaudeJSON(prompt, { maxTokens: 2500 });
}

module.exports = { runCreative };
