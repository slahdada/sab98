// ============================================================
// SABER AUTO - Main JavaScript
// ============================================================

// ============================================================
// CAR AD INTRO — CONTROLLER
// ============================================================
(function CarAdController() {

  // ── Config ──────────────────────────────────────────────
  const AD_DURATION   = 6;     // seconds before auto-close
  const CIRCUMFERENCE = 119.4; // 2π × 19px radius

  // ── Elements ────────────────────────────────────────────
  let overlay, timerArc, timerCount, skipProgress, muteBtn, muteIcon,
      soundIndicator, particles, carPass;

  // ── Audio context (engine sound) ────────────────────────
  let audioCtx = null;
  let engineNodes = null;
  let isMuted = false;

  function createEngineSound() {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(0, audioCtx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.38, audioCtx.currentTime + 0.6);
      masterGain.connect(audioCtx.destination);

      // ─ Low rumble oscillator (engine body)
      const osc1 = audioCtx.createOscillator();
      const osc1Gain = audioCtx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(55, audioCtx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.8);
      osc1.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 1.8);
      osc1.frequency.exponentialRampToValueAtTime(240, audioCtx.currentTime + 2.5);
      osc1.frequency.exponentialRampToValueAtTime(90, audioCtx.currentTime + 3.5);
      osc1.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 4.2);
      osc1Gain.gain.value = 0.55;
      osc1.connect(osc1Gain);
      osc1Gain.connect(masterGain);

      // ─ Mid-range growl
      const osc2 = audioCtx.createOscillator();
      const osc2Gain = audioCtx.createGain();
      osc2.type = 'square';
      osc2.frequency.setValueAtTime(110, audioCtx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.8);
      osc2.frequency.exponentialRampToValueAtTime(360, audioCtx.currentTime + 1.8);
      osc2.frequency.exponentialRampToValueAtTime(480, audioCtx.currentTime + 2.5);
      osc2.frequency.exponentialRampToValueAtTime(180, audioCtx.currentTime + 3.5);
      osc2.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 4.2);
      osc2Gain.gain.value = 0.25;
      osc2.connect(osc2Gain);
      osc2Gain.connect(masterGain);

      // ─ High-frequency exhaust noise
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;
      const noiseFilter = audioCtx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(800, audioCtx.currentTime);
      noiseFilter.frequency.exponentialRampToValueAtTime(3000, audioCtx.currentTime + 2);
      noiseFilter.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 4);
      noiseFilter.Q.value = 1.5;
      const noiseGain = audioCtx.createGain();
      noiseGain.gain.value = 0.12;
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);

      // ─ Compressor for realism
      const compressor = audioCtx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 20;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      masterGain.connect(compressor);
      compressor.connect(audioCtx.destination);
      // Also keep direct connection for clarity
      // (already connected above)

      // Fade out before end
      masterGain.gain.setValueAtTime(0.38, audioCtx.currentTime + 3.2);
      masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 4.5);

      osc1.start(audioCtx.currentTime);
      osc2.start(audioCtx.currentTime);
      noise.start(audioCtx.currentTime);

      osc1.stop(audioCtx.currentTime + 5);
      osc2.stop(audioCtx.currentTime + 5);
      noise.stop(audioCtx.currentTime + 5);

      engineNodes = { masterGain, osc1, osc2, noise };
    } catch (e) {
      console.warn('[CarAd] Audio not available:', e);
    }
  }

  function stopEngineSound() {
    if (!audioCtx || !engineNodes) return;
    try {
      engineNodes.masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      engineNodes.masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    } catch (e) {}
  }

  // ── Countdown ───────────────────────────────────────────
  let timer = null;
  let remaining = AD_DURATION;
  let startTs = null;

  function startCountdown() {
    startTs = Date.now();
    updateTimer(remaining);
    timer = setInterval(() => {
      const elapsed = (Date.now() - startTs) / 1000;
      remaining = Math.max(0, AD_DURATION - elapsed);
      updateTimer(remaining);
      // Skip progress bar fill
      const pct = ((AD_DURATION - remaining) / AD_DURATION) * 100;
      if (skipProgress) skipProgress.style.width = pct + '%';
      if (remaining <= 0) closeCarAd();
    }, 120);
  }

  function updateTimer(sec) {
    const s = Math.ceil(sec);
    if (timerCount) timerCount.textContent = s;
    // Arc: dashoffset goes from 0 (full) to circumference (empty)
    if (timerArc) {
      const pct = sec / AD_DURATION;
      timerArc.style.strokeDashoffset = ((1 - pct) * CIRCUMFERENCE).toFixed(2);
    }
  }

  // ── Exhaust particles ────────────────────────────────────
  function spawnParticles() {
    if (!particles) return;
    let count = 0;
    const max = 14;
    const iv = setInterval(() => {
      if (count >= max) { clearInterval(iv); return; }
      const p = document.createElement('div');
      p.className = 'ad-particle';
      const size = Math.random() * 18 + 6;
      const left = (Math.random() * 30 + 5);
      const duration = Math.random() * 1.5 + 1;
      p.style.cssText = `
        width:${size}px; height:${size}px;
        left:${left}%; bottom:0;
        animation-duration:${duration}s;
      `;
      particles.appendChild(p);
      count++;
      setTimeout(() => p.remove(), duration * 1000 + 200);
    }, 160);
  }

  // ── Close ────────────────────────────────────────────────
  window.closeCarAd = function () {
    if (!overlay) return;
    clearInterval(timer);
    stopEngineSound();
    overlay.classList.add('ad-closing');
    document.body.classList.remove('ad-active');
    setTimeout(() => {
      overlay.classList.add('ad-hidden');
      overlay.remove();
    }, 850);
  };

  // ── Mute toggle ─────────────────────────────────────────
  window.toggleAdSound = function () {
    isMuted = !isMuted;
    if (audioCtx && engineNodes) {
      engineNodes.masterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      if (isMuted) {
        engineNodes.masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
      } else {
        engineNodes.masterGain.gain.linearRampToValueAtTime(0.38, audioCtx.currentTime + 0.15);
      }
    }
    if (muteIcon) {
      muteIcon.className = isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
    }
    if (soundIndicator) {
      soundIndicator.style.opacity = isMuted ? '0.3' : '';
    }
  };

  // ── Init ─────────────────────────────────────────────────
  function init() {
    overlay       = document.getElementById('carAdOverlay');
    timerArc      = document.getElementById('adTimerArc');
    timerCount    = document.getElementById('adTimerCount');
    skipProgress  = document.getElementById('adSkipProgress');
    muteBtn       = document.getElementById('adMuteBtn');
    muteIcon      = document.getElementById('adMuteIcon');
    soundIndicator = document.getElementById('adSoundIndicator');
    particles     = document.getElementById('adParticles');
    carPass       = document.getElementById('adCarPass');

    if (!overlay) return;

    // Block scroll
    document.body.classList.add('ad-active');

    // Activate cinematic bars + content after a brief moment
    requestAnimationFrame(() => {
      overlay.classList.add('ad-ready');
    });

    // Setup timer arc
    if (timerArc) {
      timerArc.style.strokeDasharray  = CIRCUMFERENCE;
      timerArc.style.strokeDashoffset = 0;
    }

    // ── Sound requires a user gesture (browser autoplay policy) ──
    // We start the countdown immediately, but sound only plays after first click.
    let soundStarted = false;

    function startSoundOnGesture() {
      if (soundStarted) return;
      soundStarted = true;
      createEngineSound();
      // Hide the "click to hear" hint
      const hint = document.getElementById('adClickHint');
      if (hint) hint.style.display = 'none';
    }

    // Listen for ANY click/touch on the overlay to unlock audio
    overlay.addEventListener('click', startSoundOnGesture, { once: false });
    overlay.addEventListener('touchstart', startSoundOnGesture, { once: false });

    // Also try to auto-start (works if browser policy allows)
    setTimeout(() => {
      try {
        const testCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (testCtx.state === 'running') {
          testCtx.close();
          startSoundOnGesture();
        } else {
          testCtx.close();
          // Show a hint to click
          if (soundIndicator) {
            soundIndicator.innerHTML = '<i class="fas fa-hand-pointer"></i> <span>Cliquez pour le son du moteur</span>';
            soundIndicator.id = 'adClickHint';
            soundIndicator.style.cursor = 'pointer';
            soundIndicator.style.opacity = '1';
            soundIndicator.style.animation = 'adSoundPulse 0.6s ease-in-out infinite alternate';
            soundIndicator.onclick = startSoundOnGesture;
          }
        }
      } catch (e) {
        // Show click hint as fallback
      }
    }, 400);

    // Start countdown immediately (no delay needed)
    startCountdown();

    // Allow closing with Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCarAd();
    }, { once: true });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

// ─── TRANSLATIONS ──────────────────────────────────────────
const translations = {
  fr: {
    // NAV
    nav_home: "Accueil",
    nav_vehicles: "Véhicules",
    nav_whyus: "Pourquoi Nous",
    nav_import: "Import",
    nav_about: "À Propos",
    nav_contact: "Contact",

    // HERO
    hero_badge: "🏆 N°1 Spécialiste Pick-up en Tunisie",
    hero_title_1: "Voitures Presque",
    hero_title_2: "Neuves",
    hero_title_3: "Import du Golfe",
    hero_title_4: "sur Demande",
    hero_desc: "Saber Auto vous propose une sélection premium de voitures presque neuves, des occasions soigneusement choisies, et l'importation sur commande depuis les pays du Golfe. Spécialiste pick-up Isuzu, Toyota & D-Max.",
    btn_offers: "Voir les Offres",
    btn_quote: "Demander un Devis",
    btn_whatsapp: "WhatsApp",
    stat_1_label: "Véhicules Disponibles",
    stat_2_label: "Clients Satisfaits",
    stat_3_label: "Années d'Expérience",
    stat_4_label: "Importés du Golfe",

    // VEHICLES
    vehicles_tag: "Notre Stock",
    vehicles_title: "Nos ",
    vehicles_title_span: "Véhicules",
    vehicles_desc: "Découvrez notre sélection de voitures presque neuves, soigneusement inspectées et prêtes à la route.",
    filter_all: "Tous",
    filter_pickup: "Pick-up",
    filter_suv: "SUV",
    filter_sedan: "Berline",
    filter_import: "Import Golfe",
    spec_year: "Année",
    spec_km: "Km",
    spec_fuel: "Carburant",
    spec_gear: "Boîte",
    btn_details: "Détails",
    btn_contact_car: "Contacter",
    price_on_request: "Prix sur demande",
    badge_new: "Quasi Neuf",
    badge_pickup: "Pick-up",
    badge_import: "Import Golfe",
    badge_suv: "SUV",
    badge_sedan: "Berline",

    // WHY US
    why_tag: "Nos Avantages",
    why_title: "Pourquoi choisir ",
    why_title_span: "Saber Auto ?",
    why_desc: "Des années d'expérience dans l'importation et la vente de véhicules de qualité en Tunisie.",
    why_1_title: "Voitures Presque Neuves",
    why_1_desc: "Véhicules soigneusement sélectionnés, vérifiés et en excellent état. Kilométrage faible et entretien garanti.",
    why_2_title: "Import depuis le Golfe",
    why_2_desc: "Nous importons directement depuis les pays du Golfe. Voitures de qualité supérieure à prix compétitifs.",
    why_3_title: "Spécialiste Pick-up",
    why_3_desc: "Expert en pick-up Isuzu D-Max, Toyota Hilux et toutes les grandes marques. Stock disponible et import sur commande.",
    why_4_title: "Accompagnement Personnalisé",
    why_4_desc: "De la sélection à la livraison, notre équipe vous accompagne à chaque étape pour une expérience sans stress.",
    why_5_title: "Import sur Demande",
    why_5_desc: "Vous avez un modèle en tête ? Nous l'importons pour vous depuis le Golfe ou d'autres pays. Prix négociable.",
    why_6_title: "Service Client 24/7",
    why_6_desc: "Disponible via WhatsApp, téléphone et email. Réponse rapide à toutes vos questions et demandes.",

    // IMPORT
    import_tag: "Import sur Commande",
    import_title: "Import Voitures ",
    import_title_span: "depuis le Golfe",
    import_desc: "Un service d'importation clé en main depuis les pays du Golfe. Choisissez votre voiture, nous la ramenons pour vous.",
    import_badge: "🌍 Import depuis Dubai, Qatar, Arabie Saoudite",
    import_f1_title: "Choix du Véhicule",
    import_f1_desc: "Dites-nous le modèle, l'année, la couleur. Nous gérons tout depuis le Golfe.",
    import_f2_title: "Procédures Officielles",
    import_f2_desc: "Dédouanement, immatriculation et contrôle technique pris en charge.",
    import_f3_title: "Livraison à Tunis",
    import_f3_desc: "Réception dans notre showroom Route X, Avenue Mohamed Bouazizi, Bardo.",
    form_import_title: "Demande d'Import",
    form_import_desc: "Remplissez ce formulaire et nous vous contactons sous 24h.",
    form_name: "Nom complet",
    form_phone: "Téléphone",
    form_car_type: "Type de voiture",
    form_budget: "Budget estimé",
    form_message: "Message / Détails",
    form_submit: "Envoyer la Demande",
    car_type_pickup: "Pick-up (Isuzu, Toyota, D-Max...)",
    car_type_suv: "SUV / Crossover",
    car_type_sedan: "Berline / Citadine",
    car_type_other: "Autre type",

    // ABOUT
    about_tag: "Notre Histoire",
    about_title: "À Propos de ",
    about_title_span: "Saber Auto",
    about_p1: "Saber Auto est votre spécialiste automobile de confiance en Tunisie, situé au cœur de Bardo, Tunis. Depuis plusieurs années, nous nous sommes forgés une réputation d'excellence dans l'importation et la vente de véhicules presque neufs.",
    about_p2: "Notre expertise principale réside dans les pick-up de grandes marques : Isuzu D-Max, Toyota Hilux et bien d'autres. Nous importons directement depuis les pays du Golfe, garantissant des véhicules en parfait état à des prix compétitifs.",
    about_p3: "Chaque véhicule est soigneusement inspecté avant mise en vente. Notre service d'import sur demande vous permet de commander n'importe quel modèle depuis le Golfe.",
    about_h1: "Isuzu & Toyota Expert",
    about_h2: "Import Certifié Golfe",
    about_h3: "Service de Qualité",
    about_h4: "Tunis, Bardo",
    about_years: "Ans d'Expérience",
    about_manager: "Directeur de Saber Auto",

    // CONTACT
    contact_tag: "Contactez-Nous",
    contact_title: "Nous Sommes ",
    contact_title_span: "À Votre Service",
    contact_desc: "N'hésitez pas à nous contacter pour toute information sur nos véhicules ou notre service d'import.",
    contact_info_title: "Informations de Contact",
    contact_info_desc: "Retrouvez-nous sur place ou contactez-nous directement.",
    contact_email: "Email",
    contact_phone: "Téléphone",
    contact_whatsapp: "WhatsApp",
    contact_address: "Adresse",
    contact_address_val: "Route X, Av. Mohamed Bouazizi, près du Stade Bardo, Tunis, Tunisie",
    form_contact_title: "Envoyez-nous un Message",
    form_email: "Email",
    form_subject: "Sujet",
    form_msg: "Message",
    form_send: "Envoyer le Message",
    map_label: "📍 Notre Localisation",

    // FOOTER
    footer_desc: "Spécialiste voitures presque neuves et pick-up importés du Golfe. Votre partenaire automobile de confiance à Tunis.",
    footer_links: "Liens Rapides",
    footer_contact: "Contact Rapide",
    footer_hours: "Heures d'Ouverture",
    hours_weekdays: "Lun - Sam : 8h00 - 19h00",
    hours_sunday: "Dimanche : Sur RDV",
    footer_rights: "Tous droits réservés.",
    footer_made: "Fait avec ❤️ en Tunisie",

    // MISC
    lang_label: "FR",
    scroll_top: "Haut",
    sending: "Envoi en cours...",
    sent_ok: "✅ Message envoyé ! Nous vous répondrons sous 24h.",
  },

  ar: {
    nav_home: "الرئيسية",
    nav_vehicles: "السيارات",
    nav_whyus: "لماذا نحن",
    nav_import: "الاستيراد",
    nav_about: "من نحن",
    nav_contact: "اتصل بنا",

    hero_badge: "🏆 متخصص رقم 1 في البيكاب بتونس",
    hero_title_1: "سيارات شبه",
    hero_title_2: "جديدة",
    hero_title_3: "استيراد من الخليج",
    hero_title_4: "عند الطلب",
    hero_desc: "صابر أوتو يقدم لكم مجموعة مميزة من السيارات شبه الجديدة، فرصًا مختارة بعناية، واستيرادًا بالطلب من دول الخليج. متخصصون في بيكاب إيسوزو وتويوتا وD-Max.",
    btn_offers: "عرض السيارات",
    btn_quote: "طلب سعر",
    btn_whatsapp: "واتساب",
    stat_1_label: "سيارة متاحة",
    stat_2_label: "عميل راضٍ",
    stat_3_label: "سنوات خبرة",
    stat_4_label: "مستوردة من الخليج",

    vehicles_tag: "مخزوننا",
    vehicles_title: "سياراتنا ",
    vehicles_title_span: "المتاحة",
    vehicles_desc: "اكتشف مجموعتنا من السيارات شبه الجديدة المفحوصة بعناية والجاهزة للطريق.",
    filter_all: "الكل",
    filter_pickup: "بيكاب",
    filter_suv: "SUV",
    filter_sedan: "سيدان",
    filter_import: "استيراد خليجي",
    spec_year: "السنة",
    spec_km: "كم",
    spec_fuel: "الوقود",
    spec_gear: "ناقل الحركة",
    btn_details: "التفاصيل",
    btn_contact_car: "اتصل بنا",
    price_on_request: "السعر عند الطلب",
    badge_new: "شبه جديد",
    badge_pickup: "بيكاب",
    badge_import: "استيراد خليجي",
    badge_suv: "SUV",
    badge_sedan: "سيدان",

    why_tag: "مميزاتنا",
    why_title: "لماذا تختار ",
    why_title_span: "صابر أوتو؟",
    why_desc: "سنوات من الخبرة في استيراد وبيع المركبات عالية الجودة في تونس.",
    why_1_title: "سيارات شبه جديدة",
    why_1_desc: "مركبات مختارة بعناية، مفحوصة وبحالة ممتازة. كيلومترات منخفضة وصيانة مضمونة.",
    why_2_title: "استيراد من الخليج",
    why_2_desc: "نستورد مباشرة من دول الخليج العربي. جودة عالية بأسعار تنافسية.",
    why_3_title: "متخصصون في البيكاب",
    why_3_desc: "خبراء في إيسوزو D-Max، تويوتا هايلكس وجميع العلامات الكبرى. مخزون متاح واستيراد بالطلب.",
    why_4_title: "مرافقة شخصية",
    why_4_desc: "من الاختيار إلى التسليم، فريقنا يرافقكم في كل خطوة لتجربة سلسة.",
    why_5_title: "استيراد عند الطلب",
    why_5_desc: "لديك موديل في ذهنك؟ نستورده لك من الخليج أو دول أخرى. السعر قابل للتفاوض.",
    why_6_title: "خدمة عملاء 24/7",
    why_6_desc: "متاحون عبر واتساب والهاتف والبريد الإلكتروني. رد سريع على جميع استفساراتكم.",

    import_tag: "استيراد بالطلب",
    import_title: "استيراد سيارات ",
    import_title_span: "من الخليج",
    import_desc: "خدمة استيراد متكاملة من دول الخليج. اختر سيارتك ونحن نحضرها لك.",
    import_badge: "🌍 استيراد من دبي والقطر والسعودية",
    import_f1_title: "اختيار المركبة",
    import_f1_desc: "أخبرنا بالموديل والسنة واللون. نحن نتكفل بكل شيء من الخليج.",
    import_f2_title: "الإجراءات الرسمية",
    import_f2_desc: "تخليص جمركي وتسجيل وفحص فني نتكفل به.",
    import_f3_title: "التسليم في تونس",
    import_f3_desc: "الاستلام في معرضنا طريق X، شارع محمد البوعزيزي، باردو.",
    form_import_title: "طلب استيراد",
    form_import_desc: "أرسل طلبك وسنتواصل معك خلال 24 ساعة.",
    form_name: "الاسم الكامل",
    form_phone: "رقم الهاتف",
    form_car_type: "نوع السيارة",
    form_budget: "الميزانية المتوقعة",
    form_message: "رسالة / تفاصيل",
    form_submit: "إرسال الطلب",
    car_type_pickup: "بيكاب (إيسوزو، تويوتا، D-Max...)",
    car_type_suv: "SUV / كروس أوفر",
    car_type_sedan: "سيدان / سيارة صغيرة",
    car_type_other: "نوع آخر",

    about_tag: "قصتنا",
    about_title: "من نحن - ",
    about_title_span: "صابر أوتو",
    about_p1: "صابر أوتو هو متخصصكم الموثوق في مجال السيارات بتونس، يقع في قلب باردو، تونس. منذ سنوات، بنينا سمعة متميزة في استيراد وبيع السيارات شبه الجديدة.",
    about_p2: "خبرتنا الأساسية تكمن في بيكاب العلامات الكبرى: إيسوزو D-Max، تويوتا هايلكس وغيرها. نستورد مباشرة من دول الخليج مع ضمان الجودة وأسعار تنافسية.",
    about_p3: "كل مركبة تخضع لفحص دقيق قبل البيع. خدمة الاستيراد بالطلب تمكنك من طلب أي موديل من الخليج.",
    about_h1: "خبير إيسوزو وتويوتا",
    about_h2: "استيراد خليجي معتمد",
    about_h3: "خدمة عالية الجودة",
    about_h4: "تونس، باردو",
    about_years: "سنة خبرة",
    about_manager: "مدير صابر أوتو",

    contact_tag: "تواصل معنا",
    contact_title: "نحن في ",
    contact_title_span: "خدمتكم",
    contact_desc: "لا تترددوا في التواصل معنا لأي استفسار حول سياراتنا أو خدمة الاستيراد.",
    contact_info_title: "معلومات الاتصال",
    contact_info_desc: "زورونا أو تواصلوا معنا مباشرة.",
    contact_email: "البريد الإلكتروني",
    contact_phone: "الهاتف",
    contact_whatsapp: "واتساب",
    contact_address: "العنوان",
    contact_address_val: "طريق X، ش. محمد البوعزيزي، بجانب ملعب باردو، تونس",
    form_contact_title: "أرسل لنا رسالة",
    form_email: "البريد الإلكتروني",
    form_subject: "الموضوع",
    form_msg: "الرسالة",
    form_send: "إرسال الرسالة",
    map_label: "📍 موقعنا",

    footer_desc: "متخصصون في السيارات شبه الجديدة والبيكاب المستوردة من الخليج. شريككم الموثوق في أعمال السيارات بتونس.",
    footer_links: "روابط سريعة",
    footer_contact: "اتصال سريع",
    footer_hours: "ساعات العمل",
    hours_weekdays: "الاثنين - السبت: 8:00 - 19:00",
    hours_sunday: "الأحد: بالتعيين",
    footer_rights: "جميع الحقوق محفوظة.",
    footer_made: "صُنع بـ ❤️ في تونس",

    lang_label: "عر",
    sending: "جارٍ الإرسال...",
    sent_ok: "✅ تم الإرسال! سنرد عليك خلال 24 ساعة.",
  },

  en: {
    nav_home: "Home",
    nav_vehicles: "Vehicles",
    nav_whyus: "Why Us",
    nav_import: "Import",
    nav_about: "About",
    nav_contact: "Contact",

    hero_badge: "🏆 #1 Pickup Specialist in Tunisia",
    hero_title_1: "Nearly",
    hero_title_2: "New Cars",
    hero_title_3: "Gulf Import",
    hero_title_4: "on Demand",
    hero_desc: "Saber Auto offers you a premium selection of nearly new cars, carefully chosen quality vehicles, and on-demand import from Gulf countries. Specialists in Isuzu, Toyota & D-Max pickups.",
    btn_offers: "View Offers",
    btn_quote: "Request a Quote",
    btn_whatsapp: "WhatsApp",
    stat_1_label: "Vehicles Available",
    stat_2_label: "Happy Customers",
    stat_3_label: "Years Experience",
    stat_4_label: "Gulf Imports",

    vehicles_tag: "Our Stock",
    vehicles_title: "Our ",
    vehicles_title_span: "Vehicles",
    vehicles_desc: "Discover our selection of nearly new cars, carefully inspected and road-ready.",
    filter_all: "All",
    filter_pickup: "Pickup",
    filter_suv: "SUV",
    filter_sedan: "Sedan",
    filter_import: "Gulf Import",
    spec_year: "Year",
    spec_km: "Km",
    spec_fuel: "Fuel",
    spec_gear: "Gearbox",
    btn_details: "Details",
    btn_contact_car: "Contact",
    price_on_request: "Price on request",
    badge_new: "Nearly New",
    badge_pickup: "Pickup",
    badge_import: "Gulf Import",
    badge_suv: "SUV",
    badge_sedan: "Sedan",

    why_tag: "Our Advantages",
    why_title: "Why Choose ",
    why_title_span: "Saber Auto?",
    why_desc: "Years of experience in importing and selling quality vehicles in Tunisia.",
    why_1_title: "Nearly New Cars",
    why_1_desc: "Carefully selected, verified vehicles in excellent condition. Low mileage and guaranteed maintenance.",
    why_2_title: "Gulf Import",
    why_2_desc: "We import directly from Gulf countries. Superior quality at competitive prices.",
    why_3_title: "Pickup Specialist",
    why_3_desc: "Expert in Isuzu D-Max, Toyota Hilux and all major brands. Stock available and import on order.",
    why_4_title: "Personalized Support",
    why_4_desc: "From selection to delivery, our team accompanies you at every step for a stress-free experience.",
    why_5_title: "Import on Demand",
    why_5_desc: "Have a model in mind? We import it for you from the Gulf or other countries. Negotiable price.",
    why_6_title: "24/7 Customer Service",
    why_6_desc: "Available via WhatsApp, phone and email. Quick response to all your questions.",

    import_tag: "Import on Order",
    import_title: "Import Cars ",
    import_title_span: "from the Gulf",
    import_desc: "A turnkey import service from Gulf countries. Choose your car, we bring it for you.",
    import_badge: "🌍 Import from Dubai, Qatar, Saudi Arabia",
    import_f1_title: "Vehicle Selection",
    import_f1_desc: "Tell us the model, year, color. We handle everything from the Gulf.",
    import_f2_title: "Official Procedures",
    import_f2_desc: "Customs clearance, registration and technical inspection handled.",
    import_f3_title: "Delivery in Tunis",
    import_f3_desc: "Reception at our showroom, Route X, Mohamed Bouazizi Ave., Bardo.",
    form_import_title: "Import Request",
    form_import_desc: "Fill in this form and we'll contact you within 24 hours.",
    form_name: "Full Name",
    form_phone: "Phone",
    form_car_type: "Car Type",
    form_budget: "Estimated Budget",
    form_message: "Message / Details",
    form_submit: "Send Request",
    car_type_pickup: "Pickup (Isuzu, Toyota, D-Max...)",
    car_type_suv: "SUV / Crossover",
    car_type_sedan: "Sedan / City Car",
    car_type_other: "Other type",

    about_tag: "Our Story",
    about_title: "About ",
    about_title_span: "Saber Auto",
    about_p1: "Saber Auto is your trusted automotive specialist in Tunisia, located in the heart of Bardo, Tunis. For many years, we have built a reputation of excellence in importing and selling nearly new vehicles.",
    about_p2: "Our core expertise lies in pickups from major brands: Isuzu D-Max, Toyota Hilux and many others. We import directly from Gulf countries, guaranteeing vehicles in perfect condition at competitive prices.",
    about_p3: "Every vehicle is thoroughly inspected before sale. Our on-demand import service lets you order any model from the Gulf.",
    about_h1: "Isuzu & Toyota Expert",
    about_h2: "Certified Gulf Import",
    about_h3: "Quality Service",
    about_h4: "Tunis, Bardo",
    about_years: "Years of Experience",
    about_manager: "Director of Saber Auto",

    contact_tag: "Contact Us",
    contact_title: "We Are ",
    contact_title_span: "At Your Service",
    contact_desc: "Don't hesitate to contact us for any information about our vehicles or import service.",
    contact_info_title: "Contact Information",
    contact_info_desc: "Visit us in person or contact us directly.",
    contact_email: "Email",
    contact_phone: "Phone",
    contact_whatsapp: "WhatsApp",
    contact_address: "Address",
    contact_address_val: "Route X, Mohamed Bouazizi Ave., near Bardo Stadium, Tunis, Tunisia",
    form_contact_title: "Send us a Message",
    form_email: "Email",
    form_subject: "Subject",
    form_msg: "Message",
    form_send: "Send Message",
    map_label: "📍 Our Location",

    footer_desc: "Specialists in nearly new cars and Gulf-imported pickups. Your trusted automotive partner in Tunis.",
    footer_links: "Quick Links",
    footer_contact: "Quick Contact",
    footer_hours: "Opening Hours",
    hours_weekdays: "Mon - Sat: 8:00 AM - 7:00 PM",
    hours_sunday: "Sunday: By Appointment",
    footer_rights: "All rights reserved.",
    footer_made: "Made with ❤️ in Tunisia",

    lang_label: "EN",
    sending: "Sending...",
    sent_ok: "✅ Message sent! We'll reply within 24h.",
  }
};

// ─── STATE ──────────────────────────────────────────────────
let currentLang = 'fr';
let currentTheme = localStorage.getItem('sauto-theme') || 'dark';
let mobileNavOpen = false;

// ─── VEHICLES DATA ──────────────────────────────────────────
const vehicles = [
  {
    id: 1,
    name: { fr: "Isuzu D-Max 4x4", ar: "إيسوزو D-Max 4x4", en: "Isuzu D-Max 4x4" },
    img: "images/isuzu_dmax.png",
    category: "pickup",
    badge: "badge_pickup",
    year: "2021",
    km: "45,000",
    fuel: { fr: "Diesel", ar: "ديزل", en: "Diesel" },
    gear: { fr: "Auto", ar: "أوتوماتيك", en: "Auto" },
    price: { fr: "Sur demande", ar: "عند الطلب", en: "On request" }
  },
  {
    id: 2,
    name: { fr: "Toyota Hilux Double Cab", ar: "تويوتا هايلكس", en: "Toyota Hilux Double Cab" },
    img: "images/toyota_hilux.png",
    category: "pickup",
    badge: "badge_pickup",
    year: "2022",
    km: "32,000",
    fuel: { fr: "Diesel", ar: "ديزل", en: "Diesel" },
    gear: { fr: "Manuel", ar: "يدوي", en: "Manual" },
    price: { fr: "Sur demande", ar: "عند الطلب", en: "On request" }
  },
  {
    id: 3,
    name: { fr: "Toyota Hilux Pick-up", ar: "تويوتا هايلكس بيكاب", en: "Toyota Hilux Pickup" },
    img: "images/toyota_hilux.png",
    category: "pickup",
    badge: "badge_import",
    year: "2020",
    km: "58,000",
    fuel: { fr: "Diesel", ar: "ديزل", en: "Diesel" },
    gear: { fr: "Manuel", ar: "يدوي", en: "Manual" },
    price: { fr: "Sur demande", ar: "عند الطلب", en: "On request" }
  },
  {
    id: 4,
    name: { fr: "SUV Premium 4x4", ar: "SUV فاخر 4x4", en: "Premium SUV 4x4" },
    img: "images/suv.png",
    category: "suv",
    badge: "badge_suv",
    year: "2022",
    km: "28,000",
    fuel: { fr: "Essence", ar: "بنزين", en: "Gasoline" },
    gear: { fr: "Auto", ar: "أوتوماتيك", en: "Auto" },
    price: { fr: "Sur demande", ar: "عند الطلب", en: "On request" }
  },
  {
    id: 5,
    name: { fr: "Berline Luxe Import Golfe", ar: "سيدان فاخر استيراد خليجي", en: "Luxury Sedan Gulf Import" },
    img: "images/sedan.png",
    category: "sedan",
    badge: "badge_import",
    year: "2021",
    km: "41,000",
    fuel: { fr: "Essence", ar: "بنزين", en: "Gasoline" },
    gear: { fr: "Auto", ar: "أوتوماتيك", en: "Auto" },
    price: { fr: "Sur demande", ar: "عند الطلب", en: "On request" }
  },
  {
    id: 6,
    name: { fr: "Isuzu D-Max Simple Cab", ar: "إيسوزو D-Max كابينة فردية", en: "Isuzu D-Max Single Cab" },
    img: "images/isuzu_dmax.png",
    category: "pickup",
    badge: "badge_pickup",
    year: "2020",
    km: "67,000",
    fuel: { fr: "Diesel", ar: "ديزل", en: "Diesel" },
    gear: { fr: "Manuel", ar: "يدوي", en: "Manual" },
    price: { fr: "Sur demande", ar: "عند الطلب", en: "On request" }
  },
];

// ─── SLIDER DATA ─────────────────────────────────────────────
const sliderCars = [
  { img: "images/isuzu_dmax.png", name: "Isuzu D-Max", specs: "2021 • 45,000 km • Diesel" },
  { img: "images/toyota_hilux.png", name: "Toyota Hilux", specs: "2022 • 32,000 km • Diesel" },
  { img: "images/suv.png", name: "SUV Premium", specs: "2022 • 28,000 km • Essence" },
  { img: "images/sedan.png", name: "Berline Import", specs: "2021 • 41,000 km • Essence" },
  { img: "images/isuzu_dmax.png", name: "D-Max Single Cab", specs: "2020 • 67,000 km • Diesel" },
  { img: "images/toyota_hilux.png", name: "Hilux Double Cab", specs: "2020 • 58,000 km • Diesel" },
];

// ─── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSlider();
  renderVehicles('all');
  setLanguage(currentLang);
  initScrollEffects();
  initForms();
  initNav();
  initFilters();
});

// ─── THEME ──────────────────────────────────────────────────
function initTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon();
}

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('sauto-theme', currentTheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById('themeToggle');
  if (btn) btn.innerHTML = currentTheme === 'dark' 
    ? '<i class="fas fa-sun"></i>' 
    : '<i class="fas fa-moon"></i>';
}

// ─── LANGUAGE ───────────────────────────────────────────────
function setLanguage(lang) {
  currentLang = lang;
  const t = translations[lang];
  const isRTL = lang === 'ar';

  // Set dir and lang on body
  document.body.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  document.body.classList.toggle('rtl', isRTL);

  // Update lang button label
  document.querySelectorAll('.lang-current').forEach(el => {
    el.textContent = t.lang_label;
  });

  // Translate all elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = t[key];
      } else if (el.tagName === 'OPTION') {
        el.textContent = t[key];
      } else {
        el.textContent = t[key];
      }
    }
  });

  // Translate data-i18n-html (for HTML content)
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.getAttribute('data-i18n-html');
    if (t[key] !== undefined) el.innerHTML = t[key];
  });

  // Mark active lang
  document.querySelectorAll('.lang-option').forEach(el => {
    el.classList.toggle('active', el.dataset.lang === lang);
  });

  // Re-render vehicles with new lang
  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
  renderVehicles(activeFilter);

  // Update page title/meta
  document.title = lang === 'ar' ? 'صابر أوتو - سيارات شبه جديدة' : 
                   lang === 'en' ? 'Saber Auto - Nearly New Cars' : 
                   'Saber Auto - Voitures Presque Neuves';
}

// ─── SLIDER ─────────────────────────────────────────────────
function initSlider() {
  const track = document.getElementById('sliderTrack');
  if (!track) return;

  // Duplicate for infinite scroll
  const allCars = [...sliderCars, ...sliderCars];
  track.innerHTML = allCars.map(car => `
    <div class="slider-car-card">
      <img class="slider-car-img" src="${car.img}" alt="${car.name}" loading="lazy"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22260%22 height=%22155%22><rect fill=%22%23e2e8f0%22 width=%22260%22 height=%22155%22/><text fill=%22%23718096%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2214%22>🚗 ${car.name}</text></svg>'">
      <div class="slider-car-info">
        <div class="slider-car-name">${car.name}</div>
        <div class="slider-car-specs">${car.specs}</div>
      </div>
    </div>
  `).join('');
}

// ─── VEHICLES ───────────────────────────────────────────────
function renderVehicles(filter) {
  const grid = document.getElementById('vehiclesGrid');
  if (!grid) return;

  const t = translations[currentLang];
  const filtered = filter === 'all' ? vehicles : vehicles.filter(v => v.category === filter);

  grid.innerHTML = filtered.map((v, i) => {
    const badgeClass = v.badge === 'badge_pickup' ? 'vehicle-badge-pickup' : '';
    return `
    <article class="vehicle-card animate-on-scroll animate-delay-${(i % 3 + 1) * 100}" data-category="${v.category}">
      <div class="vehicle-img-wrapper">
        <img src="${v.img}" alt="${v.name[currentLang]}" loading="lazy"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22210%22><rect fill=%22%23e2e8f0%22 width=%22300%22 height=%22210%22/><text fill=%22%23718096%22 x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2216%22>🚗</text></svg>'">
        <span class="vehicle-badge ${badgeClass}">${t[v.badge]}</span>
      </div>
      <div class="vehicle-body">
        <h3 class="vehicle-name">${v.name[currentLang]}</h3>
        <div class="vehicle-specs">
          <div class="spec-item"><i class="fas fa-calendar-alt"></i> ${t.spec_year}: ${v.year}</div>
          <div class="spec-item"><i class="fas fa-tachometer-alt"></i> ${v.km} ${t.spec_km}</div>
          <div class="spec-item"><i class="fas fa-gas-pump"></i> ${v.fuel[currentLang]}</div>
          <div class="spec-item"><i class="fas fa-cog"></i> ${v.gear[currentLang]}</div>
        </div>
        <div class="vehicle-price">${t.price_on_request}</div>
        <div class="vehicle-actions">
          <a href="#contact" class="btn btn-primary">${t.btn_details}</a>
          <a href="https://wa.me/21698286333" target="_blank" class="btn btn-whatsapp"><i class="fab fa-whatsapp"></i> ${t.btn_contact_car}</a>
        </div>
      </div>
    </article>`;
  }).join('');

  // Trigger animation for newly rendered cards
  setTimeout(() => {
    grid.querySelectorAll('.animate-on-scroll').forEach(el => {
      el.classList.add('in-view');
    });
  }, 100);
}

// ─── FILTERS ────────────────────────────────────────────────
function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderVehicles(btn.dataset.filter);
    });
  });
}

// ─── SCROLL EFFECTS ─────────────────────────────────────────
function initScrollEffects() {
  const header = document.getElementById('header');
  const scrollTop = document.getElementById('scrollTop');

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    header?.classList.toggle('scrolled', y > 50);
    scrollTop?.classList.toggle('visible', y > 400);

    // Active nav
    document.querySelectorAll('section[id]').forEach(sec => {
      const top = sec.offsetTop - 100;
      const bottom = top + sec.offsetHeight;
      if (y >= top && y < bottom) {
        document.querySelectorAll('.nav-link').forEach(link => {
          link.classList.toggle('active', link.getAttribute('href') === `#${sec.id}`);
        });
      }
    });
  });

  // Intersection Observer for animations
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el));
}

// ─── FORMS ──────────────────────────────────────────────────
function initForms() {
  document.querySelectorAll('form[data-form]').forEach(form => {
    form.addEventListener('submit', handleFormSubmit);
  });
}

function handleFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('[type="submit"]');
  const t = translations[currentLang];

  btn.disabled = true;
  btn.textContent = t.sending;

  setTimeout(() => {
    btn.disabled = false;
    btn.setAttribute('data-i18n', btn.dataset.i18nKey || 'form_submit');
    btn.textContent = t[btn.dataset.i18nKey || 'form_submit'];
    showToast(t.sent_ok, 'success');
    form.reset();
  }, 1800);
}

// ─── NAV ────────────────────────────────────────────────────
function initNav() {
  const hamburger = document.getElementById('hamburger');
  const mobileNav = document.getElementById('mobileNav');
  const overlay = document.getElementById('navOverlay');

  hamburger?.addEventListener('click', () => {
    mobileNavOpen = !mobileNavOpen;
    hamburger.classList.toggle('open', mobileNavOpen);
    mobileNav.classList.toggle('open', mobileNavOpen);
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
  });

  overlay?.addEventListener('click', closeNav);

  document.querySelectorAll('#mobileNav .nav-link').forEach(link => {
    link.addEventListener('click', closeNav);
  });
}

function closeNav() {
  mobileNavOpen = false;
  document.getElementById('hamburger')?.classList.remove('open');
  document.getElementById('mobileNav')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── TOAST ──────────────────────────────────────────────────
function showToast(message, type = 'default') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ─── SCROLL TOP ─────────────────────────────────────────────
function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── SMOOTH SCROLL ─────────────────────────────────────────
document.addEventListener('click', e => {
  const link = e.target.closest('a[href^="#"]');
  if (!link) return;
  const target = document.querySelector(link.getAttribute('href'));
  if (target) {
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

// ─── FUTURISTIC PARTICLE CANVAS ────────────────────────────
function initParticles() {
  const canvas = document.createElement('canvas');
  canvas.id = 'particleCanvas';
  canvas.style.cssText = `
    position:fixed; top:0; left:0; width:100%; height:100%;
    pointer-events:none; z-index:0; opacity:0.55;
  `;
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let W = canvas.width  = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });

  const COLORS = ['#00f5ff','#ff1744','#d500f9','#00e676','#ffab00'];
  const MAX = 80;
  const particles = Array.from({ length: MAX }, () => createParticle(W, H));

  function createParticle(w, h) {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      color,
      alpha: Math.random() * 0.6 + 0.2,
      twinkle: Math.random() * Math.PI * 2
    };
  }

  // connection lines
  function drawLines() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0,245,255,${0.12 * (1 - dist / 130)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, W, H);
    frame++;

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.twinkle += 0.04;
      const alpha = p.alpha * (0.6 + 0.4 * Math.sin(p.twinkle));

      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;

      // glow dot
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      grd.addColorStop(0, p.color.replace(')', `,${alpha})`).replace('rgb', 'rgba'));
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.fillStyle = grd;
      ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    drawLines();
    requestAnimationFrame(animate);
  }
  animate();
}

// ─── CURSOR TRAIL ──────────────────────────────────────────
function initCursorTrail() {
  const trail = [];
  const MAX_TRAIL = 10;

  document.addEventListener('mousemove', e => {
    const dot = document.createElement('div');
    dot.style.cssText = `
      position:fixed; width:6px; height:6px; border-radius:50%;
      background:#00f5ff; pointer-events:none; z-index:99998;
      left:${e.clientX - 3}px; top:${e.clientY - 3}px;
      box-shadow:0 0 8px #00f5ff, 0 0 16px rgba(0,245,255,0.4);
      transition:opacity 0.4s; will-change:transform;
    `;
    document.body.appendChild(dot);
    trail.push(dot);

    setTimeout(() => {
      dot.style.opacity = '0';
      setTimeout(() => dot.remove(), 400);
    }, 80);

    if (trail.length > MAX_TRAIL) {
      const old = trail.shift();
      old?.remove();
    }
  });
}

// ─── COUNTER ANIMATION ────────────────────────────────────
function animateCounters() {
  const stats = document.querySelectorAll('.hero-stat-number');
  stats.forEach(el => {
    const match = el.textContent.match(/(\d+)/);
    if (!match) return;
    const target = parseInt(match[1]);
    let current = 0;
    const step = Math.ceil(target / 60);
    let suffix = el.innerHTML.includes('<span>+</span>') ? '+' : '';

    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.innerHTML = current + (suffix ? `<span>${suffix}</span>` : '');
      if (current >= target) clearInterval(timer);
    }, 25);
  });
}

// ─── GLITCH EFFECT ON LOGO ────────────────────────────────
function initGlitch() {
  const logo = document.querySelector('.logo-name');
  if (!logo) return;
  const original = logo.textContent;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';

  logo.addEventListener('mouseenter', () => {
    let iterations = 0;
    const interval = setInterval(() => {
      logo.textContent = original
        .split('')
        .map((c, i) => {
          if (i < iterations) return original[i];
          return c === ' ' ? ' ' : chars[Math.floor(Math.random() * chars.length)];
        })
        .join('');
      if (iterations >= original.length) clearInterval(interval);
      iterations += 0.5;
    }, 40);
  });

  logo.addEventListener('mouseleave', () => {
    logo.textContent = original;
  });
}

// ─── INIT ALL FUTURISTIC EFFECTS ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initParticles();
  initCursorTrail();
  initGlitch();
  // animate counters when hero scrolled to
  const observer = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      setTimeout(animateCounters, 600);
      observer.disconnect();
    }
  }, { threshold: 0.3 });
  const hero = document.getElementById('hero');
  if (hero) observer.observe(hero);
});
