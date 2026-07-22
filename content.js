(() => {
  "use strict";

  const KPC_DEFAULT_SETTINGS = {
    enabled: true,
    kitsuUrl: ""
  };

  function normalizeKitsuOrigin(rawUrl) {
    if (typeof rawUrl !== "string") return "";

    let value = rawUrl.trim();
    if (!value) return "";

    if (!/^https?:\/\//i.test(value)) {
      value = `http://${value}`;
    }

    try {
      return new URL(value).origin;
    } catch {
      return "";
    }
  }

  chrome.storage.sync.get(
    KPC_DEFAULT_SETTINGS,
    settings => {
      const configuredOrigin = normalizeKitsuOrigin(settings.kitsuUrl);

      if (!settings.enabled) {
        console.info("[Kitsu Persian Calendar] Disabled by user.");
        return;
      }

      if (!configuredOrigin) {
        console.info(
          "[Kitsu Persian Calendar] Kitsu address is not configured."
        );
        return;
      }

      if (window.location.origin !== configuredOrigin) {
        return;
      }

  const KPC = {
    processed: "data-kpc-processed",
    original: "data-kpc-original",
    calendarReady: "data-kpc-calendar-ready",
    prefix: "[Kitsu Persian Calendar]"
  };

  const faDigits = "۰۱۲۳۴۵۶۷۸۹";
  const enDigits = "0123456789";

  function toFaDigits(value) {
    return String(value).replace(/\d/g, d => faDigits[Number(d)]);
  }

  function toEnDigits(value) {
    return String(value).replace(/[۰-۹]/g, d => enDigits[faDigits.indexOf(d)]);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  // -----------------------------
  // Gregorian ↔ Jalali conversion
  // Based on the standard jalaali-js algorithm.
  // -----------------------------

  function div(a, b) {
    return ~~(a / b);
  }

  function mod(a, b) {
    return a - ~~(a / b) * b;
  }

  function jalCal(jy, withoutLeap = false) {
    const breaks = [
      -61, 9, 38, 199, 426, 686, 756, 818, 1111,
      1181, 1210, 1635, 2060, 2097, 2192, 2262,
      2324, 2394, 2456, 3178
    ];

    const bl = breaks.length;
    const gy = jy + 621;
    let leapJ = -14;
    let jp = breaks[0];
    let jm;
    let jump = 0;
    let leap;
    let leapG;
    let march;
    let n;
    let i;

    if (jy < jp || jy >= breaks[bl - 1]) {
      throw new Error(`Invalid Jalali year ${jy}`);
    }

    for (i = 1; i < bl; i += 1) {
      jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }

    n = jy - jp;
    leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);

    if (mod(jump, 33) === 4 && jump - n === 4) {
      leapJ += 1;
    }

    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;

    if (withoutLeap) {
      return { gy, march };
    }

    if (jump - n < 6) {
      n = n - jump + div(jump + 4, 33) * 33;
    }

    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;

    return { leap, gy, march };
  }

  function g2d(gy, gm, gd) {
    let d =
      div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
      div(153 * mod(gm + 9, 12) + 2, 5) +
      gd -
      34840408;

    d =
      d -
      div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) +
      752;

    return d;
  }

  function d2g(jdn) {
    let j = 4 * jdn + 139361631;
    j =
      j +
      div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 -
      3908;

    const i = div(mod(j, 1461), 4) * 5 + 308;
    const gd = div(mod(i, 153), 5) + 1;
    const gm = mod(div(i, 153), 12) + 1;
    const gy = div(j, 1461) - 100100 + div(8 - gm, 6);

    return { gy, gm, gd };
  }

  function j2d(jy, jm, jd) {
    const r = jalCal(jy, true);
    return (
      g2d(r.gy, 3, r.march) +
      (jm - 1) * 31 -
      div(jm, 7) * (jm - 7) +
      jd -
      1
    );
  }

  function d2j(jdn) {
    const g = d2g(jdn);
    let jy = g.gy - 621;
    const r = jalCal(jy, false);
    const jdn1f = g2d(g.gy, 3, r.march);
    let jd;
    let jm;
    let k = jdn - jdn1f;

    if (k >= 0) {
      if (k <= 185) {
        jm = 1 + div(k, 31);
        jd = mod(k, 31) + 1;
        return { jy, jm, jd };
      }
      k -= 186;
    } else {
      jy -= 1;
      k += 179;
      if (r.leap === 1) k += 1;
    }

    jm = 7 + div(k, 30);
    jd = mod(k, 30) + 1;

    return { jy, jm, jd };
  }

  function toJalaali(gy, gm, gd) {
    return d2j(g2d(gy, gm, gd));
  }

  function toGregorian(jy, jm, jd) {
    return d2g(j2d(jy, jm, jd));
  }

  function isLeapJalaaliYear(jy) {
    return jalCal(jy).leap === 0;
  }

  function jalaaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isLeapJalaaliYear(jy) ? 30 : 29;
  }

  function isValidJalaaliDate(jy, jm, jd) {
    return (
      jy >= -61 &&
      jy <= 3177 &&
      jm >= 1 &&
      jm <= 12 &&
      jd >= 1 &&
      jd <= jalaaliMonthLength(jy, jm)
    );
  }

  const persianMonths = [
    "فروردین", "اردیبهشت", "خرداد", "تیر",
    "مرداد", "شهریور", "مهر", "آبان",
    "آذر", "دی", "بهمن", "اسفند"
  ];

  const weekdayNames = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

  const shortFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const dateTimeFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const longFormatter = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const ENGLISH_MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2,
    mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12
  };

  function makeLocalDate(year, month, day, hour = 12, minute = 0, second = 0) {
    const date = new Date(year, month - 1, day, hour, minute, second);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function parseDateValue(raw) {
    if (typeof raw !== "string") return null;
    const value = raw.trim();
    if (!value) return null;

    let match = value.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
    );

    if (match) {
      const hasTime = match[4] !== undefined;
      if (hasTime) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return { date, hasTime, long: false };
      }
      const date = makeLocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
      return date ? { date, hasTime: false, long: false } : null;
    }

    match = value.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
    if (match) {
      const date = makeLocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
      return date ? { date, hasTime: false, long: false } : null;
    }

    match = value.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
    if (match) {
      const date = makeLocalDate(Number(match[3]), Number(match[2]), Number(match[1]));
      return date ? { date, hasTime: false, long: false } : null;
    }

    match = value.match(
      /^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})(?:[,]?\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/
    );

    if (match) {
      const month = ENGLISH_MONTHS[match[1].toLowerCase()];
      if (!month) return null;

      let hour = match[4] ? Number(match[4]) : 12;
      const minute = match[5] ? Number(match[5]) : 0;
      const ampm = match[6]?.toUpperCase();

      if (ampm === "PM" && hour < 12) hour += 12;
      if (ampm === "AM" && hour === 12) hour = 0;

      const date = makeLocalDate(Number(match[3]), month, Number(match[2]), hour, minute);
      return date ? { date, hasTime: Boolean(match[4]), long: true } : null;
    }

    match = value.match(
      /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})[,]?\s+(\d{4})(?:[,]?\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?$/
    );

    if (match) {
      const month = ENGLISH_MONTHS[match[2].toLowerCase()];
      if (!month) return null;

      let hour = match[4] ? Number(match[4]) : 12;
      const minute = match[5] ? Number(match[5]) : 0;
      const ampm = match[6]?.toUpperCase();

      if (ampm === "PM" && hour < 12) hour += 12;
      if (ampm === "AM" && hour === 12) hour = 0;

      const date = makeLocalDate(Number(match[3]), month, Number(match[1]), hour, minute);
      return date ? { date, hasTime: Boolean(match[4]), long: true } : null;
    }

    return null;
  }

  const INLINE_PATTERNS = [
    /\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g,
    /\b\d{4}[\/.]\d{1,2}[\/.]\d{1,2}\b/g,
    /\b\d{1,2}[\/.]\d{1,2}[\/.]\d{4}\b/g,
    /\b(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}(?:[,]?\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?\b/gi,
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)[,]?\s+\d{4}(?:[,]?\s+\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)?\b/gi
  ];

  function convertInlineDates(text) {
    let output = text;
    let changed = false;
    const originals = [];

    for (const pattern of INLINE_PATTERNS) {
      pattern.lastIndex = 0;
      output = output.replace(pattern, candidate => {
        const parsed = parseDateValue(candidate);
        if (!parsed) return candidate;

        const formatted = parsed.hasTime
          ? dateTimeFormatter.format(parsed.date)
          : parsed.long
            ? longFormatter.format(parsed.date)
            : shortFormatter.format(parsed.date);

        changed = true;
        originals.push(candidate);
        return formatted;
      });
    }

    return { output, changed, originals };
  }

  function shouldIgnoreElement(element) {
    if (!(element instanceof HTMLElement)) return true;

    if (
      ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE", "PRE", "SVG", "PATH"].includes(
        element.tagName
      )
    ) {
      return true;
    }

    if (element.isContentEditable) return true;
    if (element.closest(".kpc-jalali-calendar")) return true;
    if (element.closest(`[${KPC.processed}="true"]`)) return true;

    return false;
  }

  function rememberOriginal(element, value) {
    if (!element.hasAttribute(KPC.original)) {
      element.setAttribute(KPC.original, value);
    }
    element.setAttribute(KPC.processed, "true");
  }

  function processTimeElement(element) {
    const raw = element.getAttribute("datetime");
    if (!raw) return;

    const parsed = parseDateValue(raw);
    if (!parsed) return;

    rememberOriginal(element, element.textContent || raw);
    element.textContent = parsed.hasTime
      ? dateTimeFormatter.format(parsed.date)
      : shortFormatter.format(parsed.date);
    element.title = `میلادی: ${raw}`;
  }

  function processTextNode(textNode) {
    const parent = textNode.parentElement;
    if (!parent || shouldIgnoreElement(parent)) return;

    const original = textNode.nodeValue;
    if (!original || !original.trim()) return;

    const result = convertInlineDates(original);
    if (!result.changed) return;

    textNode.nodeValue = result.output;
    rememberOriginal(parent, original);

    if (!parent.title) {
      parent.title = `میلادی: ${result.originals.join(" | ")}`;
    }
  }


  // -----------------------------
  // Tooltip and attribute adapter
  // -----------------------------

  const DATE_ATTRIBUTES = [
    "title",
    "aria-label",
    "data-original-title",
    "data-tooltip",
    "data-tippy-content",
    "data-tooltip-content",
    "placeholder"
  ];

  function originalAttributeName(attributeName) {
    return `data-kpc-original-${attributeName.replace(/[^a-z0-9_-]/gi, "-")}`;
  }

  function processDateAttributes(element) {
    if (!(element instanceof HTMLElement)) return;
    if (element.closest(".kpc-jalali-calendar")) return;

    for (const attributeName of DATE_ATTRIBUTES) {
      const rawValue = element.getAttribute(attributeName);

      if (!rawValue || !rawValue.trim()) continue;

      // جلوگیری از تبدیل دوباره خروجی خود اکستنشن
      if (
        rawValue.includes("میلادی:") ||
        /[۰-۹]{4}[\/.-][۰-۹]{1,2}[\/.-][۰-۹]{1,2}/.test(rawValue)
      ) {
        continue;
      }

      const result = convertInlineDates(rawValue);
      if (!result.changed) continue;

      const backupName = originalAttributeName(attributeName);

      if (!element.hasAttribute(backupName)) {
        element.setAttribute(backupName, rawValue);
      }

      element.setAttribute(attributeName, result.output);
    }
  }

  function processTooltipTree(root) {
    if (!(root instanceof Element)) return;

    processDateAttributes(root);

    const selector = DATE_ATTRIBUTES
      .map(attributeName => `[${attributeName}]`)
      .join(",");

    root.querySelectorAll?.(selector).forEach(processDateAttributes);
  }


  // -----------------------------
  // Compact task-date adapter
  // -----------------------------

  function parseFullGregorianDateTime(raw) {
    if (typeof raw !== "string") return null;

    const match = raw.trim().match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );

    if (!match) return null;

    const gy = Number(match[1]);
    const gm = Number(match[2]);
    const gd = Number(match[3]);
    const hour = match[4] !== undefined ? Number(match[4]) : null;
    const minute = match[5] !== undefined ? Number(match[5]) : null;

    const date = makeLocalDate(
      gy,
      gm,
      gd,
      hour ?? 12,
      minute ?? 0,
      match[6] ? Number(match[6]) : 0
    );

    if (!date) return null;

    return { date, gy, gm, gd, hour, minute };
  }

  function processCompactTaskDate(element) {
    if (!(element instanceof HTMLElement)) return;

    const looksLikeTaskDate =
      element.matches(".flexrow-item.date, span.date, .date.flexrow-item") ||
      (
        element.classList.contains("date") &&
        /^\s*\d{1,2}\/\d{1,2}\s*$/.test(element.textContent || "")
      );

    if (!looksLikeTaskDate) return;

    const raw =
      element.getAttribute("data-kpc-original-title") ||
      element.getAttribute("data-original-title") ||
      element.getAttribute("title");

    const parsed = parseFullGregorianDateTime(raw || "");
    if (!parsed) return;

    const jalali = toJalaali(parsed.gy, parsed.gm, parsed.gd);

    // حفظ حالت فشرده مشابه 07/21
    element.textContent = `${toFaDigits(pad2(jalali.jm))}/${toFaDigits(pad2(jalali.jd))}`;
    element.setAttribute("data-kpc-compact-date", "true");
    element.setAttribute("data-kpc-original-compact-text", `${pad2(parsed.gm)}/${pad2(parsed.gd)}`);

    const fullPersianDate = `${toFaDigits(jalali.jy)}/${toFaDigits(pad2(jalali.jm))}/${toFaDigits(pad2(jalali.jd))}`;
    const timePart =
      parsed.hour !== null && parsed.minute !== null
        ? `، ${toFaDigits(pad2(parsed.hour))}:${toFaDigits(pad2(parsed.minute))}`
        : "";

    element.setAttribute("title", `${fullPersianDate}${timePart}`);
  }

  function processCompactTaskDates(root) {
    if (!(root instanceof Element)) return;

    processCompactTaskDate(root);

    root.querySelectorAll?.(
      ".flexrow-item.date, span.date, .date.flexrow-item"
    ).forEach(processCompactTaskDate);
  }


  // -----------------------------
  // DatePicker input display adapter
  // -----------------------------

  function parseGregorianInputValue(raw) {
    if (typeof raw !== "string") return null;

    const match = raw.trim().match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/
    );

    if (!match) return null;

    const gy = Number(match[1]);
    const gm = Number(match[2]);
    const gd = Number(match[3]);

    const date = makeLocalDate(gy, gm, gd);
    if (!date) return null;

    return { gy, gm, gd, iso: `${match[1]}-${match[2]}-${match[3]}` };
  }

  function formatCompactJalaliInput(gy, gm, gd) {
    const jalali = toJalaali(gy, gm, gd);

    return `${toFaDigits(jalali.jy)}/${toFaDigits(pad2(jalali.jm))}/${toFaDigits(pad2(jalali.jd))}`;
  }

  function setDisplayedInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    );

    descriptor?.set?.call(input, value);
  }

  function processDatePickerInput(input) {
    if (!(input instanceof HTMLInputElement)) return;

    const isVueDatePickerInput =
      input.matches('input[data-test-id="dp-input"]') ||
      input.classList.contains("dp__input");

    if (!isVueDatePickerInput) return;

    const currentValue = input.value || input.getAttribute("value") || "";

    /*
      اگر Vue دوباره مقدار میلادی را روی input قرار داد،
      آن را ذخیره و فقط نمایش DOM را شمسی می‌کنیم.
      مدل داخلی Vue تغییر نمی‌کند، چون event ارسال نمی‌شود.
    */
    const parsed = parseGregorianInputValue(currentValue);

    if (parsed) {
      input.setAttribute("data-kpc-gregorian-value", parsed.iso);
      input.setAttribute("data-kpc-input-ready", "true");

      const jalaliValue = formatCompactJalaliInput(
        parsed.gy,
        parsed.gm,
        parsed.gd
      );

      setDisplayedInputValue(input, jalaliValue);
      input.setAttribute("title", `میلادی: ${parsed.iso}`);
      return;
    }

    /*
      اگر خود input قبلاً شمسی شده باشد، کاری انجام نمی‌دهیم.
    */
    if (
      input.hasAttribute("data-kpc-input-ready") &&
      /^[۰-۹]{4}\/[۰-۹]{2}\/[۰-۹]{2}$/.test(currentValue)
    ) {
      return;
    }

    /*
      بعضی نسخه‌های Vue مقدار تازه را فقط در attribute می‌گذارند.
    */
    const attributeValue = input.getAttribute("value") || "";
    const parsedAttribute = parseGregorianInputValue(attributeValue);

    if (parsedAttribute) {
      input.setAttribute("data-kpc-gregorian-value", parsedAttribute.iso);
      input.setAttribute("data-kpc-input-ready", "true");

      setDisplayedInputValue(
        input,
        formatCompactJalaliInput(
          parsedAttribute.gy,
          parsedAttribute.gm,
          parsedAttribute.gd
        )
      );

      input.setAttribute("title", `میلادی: ${parsedAttribute.iso}`);
    }
  }

  function processDatePickerInputs(root) {
    if (!(root instanceof Element)) return;

    if (
      root instanceof HTMLInputElement &&
      (
        root.matches('input[data-test-id="dp-input"]') ||
        root.classList.contains("dp__input")
      )
    ) {
      processDatePickerInput(root);
    }

    root.querySelectorAll?.(
      'input[data-test-id="dp-input"], input.dp__input'
    ).forEach(processDatePickerInput);
  }

  function installDatePickerInputListeners() {
    const refresh = event => {
      const input = event.target;

      if (
        input instanceof HTMLInputElement &&
        (
          input.matches('input[data-test-id="dp-input"]') ||
          input.classList.contains("dp__input")
        )
      ) {
        requestAnimationFrame(() => processDatePickerInput(input));
        setTimeout(() => processDatePickerInput(input), 50);
        setTimeout(() => processDatePickerInput(input), 200);
      }
    };

    document.addEventListener("click", refresh, true);
    document.addEventListener("focusin", refresh, true);
    document.addEventListener("input", refresh, true);
    document.addEventListener("change", refresh, true);
  }


  // -----------------------------
  // Gregorian month/year filter display adapter
  // -----------------------------

  const GREGORIAN_MONTH_INDEX = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4,
    May: 5, Jun: 6, Jul: 7, Aug: 8,
    Sep: 9, Oct: 10, Nov: 11, Dec: 12
  };

  function findFieldLabel(select) {
    const field = select.closest(".field");
    const label = field?.querySelector("label.label");
    return (label?.textContent || "").trim().toLowerCase();
  }

  function findSiblingFilterSelect(select, labelText) {
    const filters = select.closest(".filters") || select.parentElement?.parentElement;
    if (!filters) return null;

    const selects = Array.from(filters.querySelectorAll("select"));

    return selects.find(candidate =>
      findFieldLabel(candidate) === labelText.toLowerCase()
    ) || null;
  }

  function jalaliMonthSpanForGregorianMonth(gy, gm) {
    const first = toJalaali(gy, gm, 1);
    const lastGregorianDay = new Date(gy, gm, 0).getDate();
    const last = toJalaali(gy, gm, lastGregorianDay);

    if (first.jy === last.jy && first.jm === last.jm) {
      return persianMonths[first.jm - 1];
    }

    if (first.jy === last.jy) {
      return `${persianMonths[first.jm - 1]}–${persianMonths[last.jm - 1]}`;
    }

    return (
      `${persianMonths[first.jm - 1]} ${toFaDigits(first.jy)}` +
      `–${persianMonths[last.jm - 1]} ${toFaDigits(last.jy)}`
    );
  }

  function jalaliYearSpanForGregorianYear(gy) {
    const first = toJalaali(gy, 1, 1);
    const last = toJalaali(gy, 12, 31);

    if (first.jy === last.jy) {
      return toFaDigits(first.jy);
    }

    return `${toFaDigits(first.jy)}–${toFaDigits(last.jy)}`;
  }

  function restoreOptionSource(option) {
    if (!option.hasAttribute("data-kpc-source-text")) {
      option.setAttribute("data-kpc-source-text", option.textContent.trim());
    }
    return option.getAttribute("data-kpc-source-text") || option.value;
  }

  function inferYearForMonthFilter(select) {
    const yearSelect = findSiblingFilterSelect(select, "year");
    const selectedYear = Number(yearSelect?.value);

    if (Number.isInteger(selectedYear)) {
      return selectedYear;
    }

    const filters = select.closest(".filters");
    const scope =
      filters?.parentElement ||
      select.closest(".schedule") ||
      select.closest("[class*='schedule']") ||
      document;

    /*
      ابتدا سال را از تاریخ‌های بازسازی‌شده Schedule می‌خوانیم.
    */
    const scheduleDate = scope.querySelector?.(
      ".timeline-header [data-kpc-schedule-date]"
    );

    if (scheduleDate) {
      const raw = scheduleDate.getAttribute("data-kpc-schedule-date") || "";
      const match = raw.match(/^(\d{4})-/);

      if (match) {
        return Number(match[1]);
      }
    }

    /*
      اگر Schedule هنوز پردازش نشده باشد، از عنوان‌هایی مثل April 26 استفاده می‌کنیم.
    */
    const monthLabels = Array.from(
      scope.querySelectorAll?.(".timeline-header .month-name") || []
    );

    for (const label of monthLabels) {
      const raw =
        label.getAttribute("data-kpc-schedule-original-month") ||
        label.textContent?.trim() ||
        "";

      const parsed = parseScheduleMonthLabel(raw);

      if (parsed?.gy) {
        return parsed.gy;
      }
    }

    /*
      fallback: سال میلادی فعلی.
    */
    return new Date().getFullYear();
  }

  function processMonthFilterSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    if (findFieldLabel(select) !== "month") return;

    const selectedYear = inferYearForMonthFilter(select);

    if (!Number.isInteger(selectedYear)) return;

    for (const option of select.options) {
      const source = restoreOptionSource(option);
      const gm =
        GREGORIAN_MONTH_INDEX[option.value] ||
        GREGORIAN_MONTH_INDEX[source];

      if (!gm) continue;

      option.textContent =
        jalaliMonthSpanForGregorianMonth(selectedYear, gm);

      option.setAttribute("data-kpc-filter-option", "month");
      option.setAttribute(
        "data-kpc-filter-gregorian",
        `${option.value} ${selectedYear}`
      );
    }

    select.setAttribute("data-kpc-persian-filter", "month");
    select.setAttribute(
      "data-kpc-month-filter-year",
      String(selectedYear)
    );

    select.title =
      `ماه میلادی داخلی: ${select.value} ${selectedYear}`;
  }

  function processYearFilterSelect(select) {
    if (!(select instanceof HTMLSelectElement)) return;
    if (findFieldLabel(select) !== "year") return;

    for (const option of select.options) {
      const source = restoreOptionSource(option);
      const gy = Number(option.value || source);

      if (!Number.isInteger(gy)) continue;

      option.textContent = jalaliYearSpanForGregorianYear(gy);
      option.setAttribute("data-kpc-filter-option", "year");
    }

    select.setAttribute("data-kpc-persian-filter", "year");
    select.title = `سال میلادی داخلی: ${select.value}`;
  }

  function processGregorianPeriodFilters(root) {
    if (!(root instanceof Element)) return;

    const candidates = [];

    if (root instanceof HTMLSelectElement) {
      candidates.push(root);
    }

    root.querySelectorAll?.("select").forEach(select => candidates.push(select));

    for (const select of candidates) {
      const label = findFieldLabel(select);

      if (label === "month") {
        processMonthFilterSelect(select);
      } else if (label === "year") {
        processYearFilterSelect(select);
      }
    }
  }

  function installGregorianPeriodFilterListeners() {
    document.addEventListener(
      "change",
      event => {
        const select = event.target;

        if (!(select instanceof HTMLSelectElement)) return;

        const label = findFieldLabel(select);

        if (label === "year") {
          const monthSelect = findSiblingFilterSelect(select, "month");

          requestAnimationFrame(() => {
            processYearFilterSelect(select);
            if (monthSelect) processMonthFilterSelect(monthSelect);
          });
        } else if (label === "month") {
          requestAnimationFrame(() => processMonthFilterSelect(select));
        }
      },
      true
    );
  }


  // -----------------------------
  // FullCalendar Jalali display adapter
  // -----------------------------

  const FULLCALENDAR_WEEKDAYS = {
    mon: "دوشنبه",
    tue: "سه‌شنبه",
    wed: "چهارشنبه",
    thu: "پنجشنبه",
    fri: "جمعه",
    sat: "شنبه",
    sun: "یکشنبه"
  };

  const FULLCALENDAR_BUTTON_TEXT = {
    today: "امروز",
    month: "ماه",
    week: "هفته",
    year: "سال"
  };

  function parseIsoDateParts(raw) {
    if (typeof raw !== "string") return null;

    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    return {
      gy: Number(match[1]),
      gm: Number(match[2]),
      gd: Number(match[3])
    };
  }

  function parseIsoMonthParts(raw) {
    if (typeof raw !== "string") return null;

    const match = raw.match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;

    return {
      gy: Number(match[1]),
      gm: Number(match[2])
    };
  }

  function fullCalendarMonthTitle(gy, gm) {
    const first = toJalaali(gy, gm, 1);
    const lastDay = new Date(gy, gm, 0).getDate();
    const last = toJalaali(gy, gm, lastDay);

    if (first.jy === last.jy && first.jm === last.jm) {
      return `${persianMonths[first.jm - 1]} ${toFaDigits(first.jy)}`;
    }

    if (first.jy === last.jy) {
      return (
        `${persianMonths[first.jm - 1]}–` +
        `${persianMonths[last.jm - 1]} ${toFaDigits(first.jy)}`
      );
    }

    return (
      `${persianMonths[first.jm - 1]} ${toFaDigits(first.jy)}–` +
      `${persianMonths[last.jm - 1]} ${toFaDigits(last.jy)}`
    );
  }

  function fullCalendarYearTitle(gy) {
    const first = toJalaali(gy, 1, 1);
    const last = toJalaali(gy, 12, 31);

    return first.jy === last.jy
      ? toFaDigits(first.jy)
      : `${toFaDigits(first.jy)}–${toFaDigits(last.jy)}`;
  }

  function processFullCalendarDayCell(cell) {
    if (!(cell instanceof HTMLElement)) return;

    const raw = cell.getAttribute("data-date");
    const parsed = parseIsoDateParts(raw || "");
    if (!parsed) return;

    const jalali = toJalaali(parsed.gy, parsed.gm, parsed.gd);
    const number = cell.querySelector(".fc-daygrid-day-number");

    if (number instanceof HTMLElement) {
      if (!number.hasAttribute("data-kpc-original-day-number")) {
        number.setAttribute(
          "data-kpc-original-day-number",
          number.textContent?.trim() || String(parsed.gd)
        );
      }

      number.textContent = toFaDigits(jalali.jd);
      number.setAttribute(
        "aria-label",
        `${toFaDigits(jalali.jd)} ${persianMonths[jalali.jm - 1]} ${toFaDigits(jalali.jy)}`
      );
      number.setAttribute("data-kpc-fullcalendar-day", "true");
      number.title = `میلادی: ${raw}`;
    }

    cell.setAttribute("data-kpc-jalali-date", `${jalali.jy}-${pad2(jalali.jm)}-${pad2(jalali.jd)}`);
  }

  function processFullCalendarMonth(monthElement) {
    if (!(monthElement instanceof HTMLElement)) return;

    const raw = monthElement.getAttribute("data-date");
    const parsed = parseIsoMonthParts(raw || "");
    if (!parsed) return;

    const title = monthElement.querySelector(".fc-multimonth-title");

    if (title instanceof HTMLElement) {
      if (!title.hasAttribute("data-kpc-original-month-title")) {
        title.setAttribute(
          "data-kpc-original-month-title",
          title.textContent?.trim() || ""
        );
      }

      title.textContent = fullCalendarMonthTitle(parsed.gy, parsed.gm);
      title.setAttribute("data-kpc-fullcalendar-month", "true");
      title.title = `ماه میلادی: ${raw}`;
    }

    monthElement
      .querySelectorAll('.fc-daygrid-day[data-date]')
      .forEach(processFullCalendarDayCell);
  }

  function processFullCalendarWeekdays(calendar) {
    const headers = calendar.querySelectorAll(".fc-col-header-cell");

    headers.forEach(header => {
      const className = Array.from(header.classList)
        .find(name => /^fc-day-(mon|tue|wed|thu|fri|sat|sun)$/.test(name));

      if (!className) return;

      const key = className.replace("fc-day-", "");
      const label = FULLCALENDAR_WEEKDAYS[key];
      const cushion = header.querySelector(".fc-col-header-cell-cushion");

      if (!(cushion instanceof HTMLElement) || !label) return;

      if (!cushion.hasAttribute("data-kpc-original-weekday")) {
        cushion.setAttribute(
          "data-kpc-original-weekday",
          cushion.textContent?.trim() || ""
        );
      }

      cushion.textContent = label;
      cushion.setAttribute("aria-label", label);
      cushion.setAttribute("data-kpc-fullcalendar-weekday", "true");
    });
  }

  function processFullCalendarToolbar(calendar) {
    const toolbarTitle = calendar.querySelector(".fc-toolbar-title");

    if (toolbarTitle instanceof HTMLElement) {
      const rawText =
        toolbarTitle.getAttribute("data-kpc-gregorian-toolbar-year") ||
        toolbarTitle.textContent?.trim() ||
        "";

      const match = rawText.match(/\b(\d{4})\b/);

      if (match) {
        const gy = Number(match[1]);

        toolbarTitle.setAttribute(
          "data-kpc-gregorian-toolbar-year",
          String(gy)
        );
        toolbarTitle.textContent = fullCalendarYearTitle(gy);
        toolbarTitle.title = `سال میلادی: ${gy}`;
        toolbarTitle.setAttribute("data-kpc-fullcalendar-year", "true");
      }
    }

    const todayButton = calendar.querySelector(".fc-today-button");
    if (todayButton instanceof HTMLElement) {
      todayButton.textContent = FULLCALENDAR_BUTTON_TEXT.today;
      todayButton.title = "سال جاری";
    }

    const monthButton = calendar.querySelector(".fc-dayGridMonth-button");
    if (monthButton instanceof HTMLElement) {
      monthButton.textContent = FULLCALENDAR_BUTTON_TEXT.month;
      monthButton.title = "نمای ماه";
    }

    const weekButton = calendar.querySelector(".fc-dayGridWeek-button");
    if (weekButton instanceof HTMLElement) {
      weekButton.textContent = FULLCALENDAR_BUTTON_TEXT.week;
      weekButton.title = "نمای هفته";
    }

    const yearButton = calendar.querySelector(".fc-multiMonthYear-button");
    if (yearButton instanceof HTMLElement) {
      yearButton.textContent = FULLCALENDAR_BUTTON_TEXT.year;
      yearButton.title = "نمای سال";
    }

    const prevButton = calendar.querySelector(".fc-prev-button");
    if (prevButton instanceof HTMLElement) {
      prevButton.title = "سال قبل";
    }

    const nextButton = calendar.querySelector(".fc-next-button");
    if (nextButton instanceof HTMLElement) {
      nextButton.title = "سال بعد";
    }
  }

  function processFullCalendar(calendar) {
    if (!(calendar instanceof HTMLElement)) return;
    if (!calendar.classList.contains("fc")) return;

    processFullCalendarToolbar(calendar);
    processFullCalendarWeekdays(calendar);

    calendar
      .querySelectorAll(".fc-multimonth-month[data-date]")
      .forEach(processFullCalendarMonth);

    calendar
      .querySelectorAll('.fc-daygrid-day[data-date]')
      .forEach(processFullCalendarDayCell);

    calendar.setAttribute("data-kpc-fullcalendar", "true");
  }

  function processFullCalendars(root) {
    if (!(root instanceof Element)) return;

    if (root.classList.contains("fc")) {
      processFullCalendar(root);
    }

    root.querySelectorAll?.(".fc").forEach(processFullCalendar);
  }

  function installFullCalendarListeners() {
    document.addEventListener(
      "click",
      event => {
        const target = event.target;

        if (!(target instanceof Element)) return;

        if (
          target.closest(
            ".fc-prev-button, .fc-next-button, .fc-today-button, " +
            ".fc-dayGridMonth-button, .fc-dayGridWeek-button, .fc-multiMonthYear-button"
          )
        ) {
          setTimeout(() => processFullCalendars(document.body), 0);
          setTimeout(() => processFullCalendars(document.body), 80);
          setTimeout(() => processFullCalendars(document.body), 250);
        }
      },
      true
    );
  }


  // -----------------------------
  // Schedule timeline Jalali adapter
  // -----------------------------

  const SCHEDULE_MONTHS = {
    january: 1, february: 2, march: 3, april: 4,
    may: 5, june: 6, july: 7, august: 8,
    september: 9, october: 10, november: 11, december: 12
  };

  function parseScheduleMonthLabel(raw) {
    if (typeof raw !== "string") return null;

    const match = raw.trim().match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{2}|\d{4})$/i
    );

    if (!match) return null;

    const gm = SCHEDULE_MONTHS[match[1].toLowerCase()];
    let gy = Number(match[2]);

    if (gy < 100) {
      gy += gy >= 70 ? 1900 : 2000;
    }

    return { gy, gm };
  }

  function addGregorianDays(date, amount) {
    const result = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      12,
      0,
      0
    );

    result.setDate(result.getDate() + amount);
    return result;
  }

  function inferScheduleDates(header) {
    const dayElements = Array.from(
      header.querySelectorAll(":scope > .day")
    );

    if (!dayElements.length) return [];

    let currentDate = null;
    const resolved = [];

    for (let index = 0; index < dayElements.length; index += 1) {
      const dayElement = dayElements[index];
      const dayNumberElement = dayElement.querySelector(".day-number");
      const monthNameElement = dayElement.querySelector(".month-name");

      const sourceDayText =
        dayNumberElement?.getAttribute("data-kpc-schedule-original-day") ||
        dayNumberElement?.textContent?.trim() ||
        "";

      const sourceDay = Number(toEnDigits(sourceDayText));

      if (monthNameElement) {
        const sourceMonthText =
          monthNameElement.getAttribute("data-kpc-schedule-original-month") ||
          monthNameElement.textContent?.trim() ||
          "";

        const monthInfo = parseScheduleMonthLabel(sourceMonthText);

        if (monthInfo && Number.isInteger(sourceDay)) {
          currentDate = new Date(
            monthInfo.gy,
            monthInfo.gm - 1,
            sourceDay,
            12,
            0,
            0
          );
        }
      }

      if (!currentDate && index > 0 && resolved[index - 1]?.date) {
        currentDate = addGregorianDays(resolved[index - 1].date, 1);
      }

      if (!currentDate) {
        resolved.push({ dayElement, dayNumberElement, monthNameElement, date: null });
        continue;
      }

      /*
        اگر Vue ماه جدید را بدون عنوان قابل‌خواندن بازسازی کرده باشد،
        تغییر عدد روز از 31 به 01 را نیز تشخیص می‌دهیم.
      */
      if (
        index > 0 &&
        Number.isInteger(sourceDay) &&
        resolved[index - 1]?.sourceDay &&
        sourceDay < resolved[index - 1].sourceDay
      ) {
        const previous = resolved[index - 1].date;
        currentDate = addGregorianDays(previous, 1);
      }

      resolved.push({
        dayElement,
        dayNumberElement,
        monthNameElement,
        date: new Date(currentDate),
        sourceDay
      });

      currentDate = addGregorianDays(currentDate, 1);
    }

    return resolved;
  }

  function ensureScheduleMonthLabel(dayElement) {
    let dateName = dayElement.querySelector(".date-name");

    if (!(dateName instanceof HTMLElement)) {
      return null;
    }

    let monthName = dateName.querySelector(".month-name");

    if (!(monthName instanceof HTMLElement)) {
      monthName = document.createElement("span");
      monthName.className = "month-name kpc-created-schedule-month";
      dateName.insertBefore(monthName, dateName.firstChild);
    }

    return monthName;
  }

  function processScheduleHeader(header) {
    if (!(header instanceof HTMLElement)) return;
    if (!header.classList.contains("timeline-header")) return;

    const resolved = inferScheduleDates(header);
    if (!resolved.length) return;

    for (const item of resolved) {
      const {
        dayElement,
        dayNumberElement,
        monthNameElement,
        date
      } = item;

      if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        continue;
      }

      const gy = date.getFullYear();
      const gm = date.getMonth() + 1;
      const gd = date.getDate();
      const jalali = toJalaali(gy, gm, gd);
      const iso = `${gy}-${pad2(gm)}-${pad2(gd)}`;

      dayElement.setAttribute("data-kpc-schedule-date", iso);
      dayElement.setAttribute(
        "data-kpc-schedule-jalali",
        `${jalali.jy}-${pad2(jalali.jm)}-${pad2(jalali.jd)}`
      );

      if (dayNumberElement instanceof HTMLElement) {
        if (!dayNumberElement.hasAttribute("data-kpc-schedule-original-day")) {
          dayNumberElement.setAttribute(
            "data-kpc-schedule-original-day",
            dayNumberElement.textContent?.trim() || String(gd)
          );
        }

        dayNumberElement.textContent = toFaDigits(pad2(jalali.jd));
        dayNumberElement.title =
          `${toFaDigits(jalali.jd)} ${persianMonths[jalali.jm - 1]} ${toFaDigits(jalali.jy)}` +
          ` — میلادی: ${iso}`;
        dayNumberElement.setAttribute("data-kpc-schedule-day", "true");
      }

      /*
        برچسب‌های ماه میلادی را حذف می‌کنیم.
        برچسب جدید فقط روی روز اول هر ماه شمسی قرار می‌گیرد.
      */
      if (monthNameElement instanceof HTMLElement) {
        if (!monthNameElement.hasAttribute("data-kpc-schedule-original-month")) {
          monthNameElement.setAttribute(
            "data-kpc-schedule-original-month",
            monthNameElement.textContent?.trim() || ""
          );
        }

        monthNameElement.textContent = "";
        monthNameElement.classList.add("kpc-hidden-gregorian-month");
      }

      if (jalali.jd === 1) {
        const jalaliMonthLabel = ensureScheduleMonthLabel(dayElement);

        if (jalaliMonthLabel instanceof HTMLElement) {
          jalaliMonthLabel.textContent =
            `${persianMonths[jalali.jm - 1]} ${toFaDigits(String(jalali.jy).slice(-2))}`;
          jalaliMonthLabel.classList.remove("kpc-hidden-gregorian-month");
          jalaliMonthLabel.setAttribute("data-kpc-schedule-month", "true");
          jalaliMonthLabel.title =
            `${persianMonths[jalali.jm - 1]} ${toFaDigits(jalali.jy)}`;
        }
      }

      const weekNumber = dayElement.querySelector(".week-number");

      if (weekNumber instanceof HTMLElement) {
        if (!weekNumber.hasAttribute("data-kpc-schedule-original-week")) {
          weekNumber.setAttribute(
            "data-kpc-schedule-original-week",
            weekNumber.textContent?.trim() || ""
          );
        }

        weekNumber.textContent = toFaDigits(
          weekNumber.getAttribute("data-kpc-schedule-original-week") || ""
        );
      }
    }

    header.setAttribute("data-kpc-schedule-header", "true");

    const container =
      header.closest(".schedule") ||
      header.closest("[class*='schedule']") ||
      header.parentElement;

    container
      ?.querySelectorAll?.("select")
      .forEach(select => {
        if (findFieldLabel(select) === "month") {
          processMonthFilterSelect(select);
        }
      });
  }

  function processScheduleTimelines(root) {
    if (!(root instanceof Element)) return;

    if (root.classList.contains("timeline-header")) {
      processScheduleHeader(root);
    }

    root
      .querySelectorAll?.(".timeline-header")
      .forEach(processScheduleHeader);
  }

  function installScheduleListeners() {
    document.addEventListener(
      "click",
      event => {
        const target = event.target;

        if (!(target instanceof Element)) return;

        if (
          target.closest(
            ".schedule button, .schedule .selector, " +
            ".timeline button, [class*='zoom'] select"
          )
        ) {
          setTimeout(() => processScheduleTimelines(document.body), 0);
          setTimeout(() => processScheduleTimelines(document.body), 100);
          setTimeout(() => processScheduleTimelines(document.body), 350);
        }
      },
      true
    );
  }


  // -----------------------------
  // Monthly employment/salary form adapter
  // -----------------------------

  function gregorianMonthRangeLabel(gy, gm, includeYear = true) {
    const first = toJalaali(gy, gm, 1);
    const lastDay = new Date(gy, gm, 0).getDate();
    const last = toJalaali(gy, gm, lastDay);

    if (first.jy === last.jy && first.jm === last.jm) {
      return includeYear
        ? `${persianMonths[first.jm - 1]} ${toFaDigits(first.jy)}`
        : persianMonths[first.jm - 1];
    }

    if (first.jy === last.jy) {
      return includeYear
        ? `${persianMonths[first.jm - 1]}–${persianMonths[last.jm - 1]} ${toFaDigits(first.jy)}`
        : `${persianMonths[first.jm - 1]}–${persianMonths[last.jm - 1]}`;
    }

    return (
      `${persianMonths[first.jm - 1]} ${toFaDigits(first.jy)}–` +
      `${persianMonths[last.jm - 1]} ${toFaDigits(last.jy)}`
    );
  }

  function parseYearMonth(raw) {
    if (typeof raw !== "string") return null;

    const match = raw.trim().match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;

    return {
      gy: Number(match[1]),
      gm: Number(match[2])
    };
  }

  function identifyMonthlyDateSelectors(monthField) {
    if (!(monthField instanceof HTMLElement)) return null;

    const selects = Array.from(
      monthField.querySelectorAll(".date-selector select")
    );

    if (selects.length < 2) return null;

    const yearSelect = selects.find(select =>
      Array.from(select.options).some(option => /^\d{4}$/.test(option.value))
    );

    const monthSelect = selects.find(select =>
      select !== yearSelect &&
      Array.from(select.options).some(option =>
        /^(0|1|2|3|4|5|6|7|8|9|10|11)$/.test(option.value)
      )
    );

    if (!(yearSelect instanceof HTMLSelectElement)) return null;
    if (!(monthSelect instanceof HTMLSelectElement)) return null;

    return { yearSelect, monthSelect };
  }

  function processMonthlyStartDateField(monthField) {
    if (!(monthField instanceof HTMLElement)) return;
    if (!monthField.classList.contains("month-field")) return;

    const label = monthField.querySelector(":scope > label.label");
    if ((label?.textContent || "").trim().toLowerCase() !== "start date") {
      return;
    }

    const selectors = identifyMonthlyDateSelectors(monthField);
    if (!selectors) return;

    const { yearSelect, monthSelect } = selectors;
    const selectedGy = Number(yearSelect.value);
    const selectedMonthIndex = Number(monthSelect.value);
    const selectedGm = selectedMonthIndex + 1;

    if (!Number.isInteger(selectedGy) || selectedGm < 1 || selectedGm > 12) {
      return;
    }

    for (const option of yearSelect.options) {
      if (!option.hasAttribute("data-kpc-monthly-source-year")) {
        option.setAttribute(
          "data-kpc-monthly-source-year",
          option.textContent.trim()
        );
      }

      const gy = Number(option.value);
      if (!Number.isInteger(gy)) continue;

      option.textContent = jalaliYearSpanForGregorianYear(gy);
    }

    for (const option of monthSelect.options) {
      if (!option.hasAttribute("data-kpc-monthly-source-month")) {
        option.setAttribute(
          "data-kpc-monthly-source-month",
          option.textContent.trim()
        );
      }

      const gm = Number(option.value) + 1;
      if (gm < 1 || gm > 12) continue;

      option.textContent = gregorianMonthRangeLabel(selectedGy, gm, false);
      option.setAttribute(
        "data-kpc-monthly-gregorian",
        `${selectedGy}-${pad2(gm)}`
      );
    }

    yearSelect.setAttribute("data-kpc-monthly-year", "true");
    monthSelect.setAttribute("data-kpc-monthly-month", "true");

    yearSelect.title = `سال میلادی داخلی: ${selectedGy}`;
    monthSelect.title =
      `ماه میلادی داخلی: ${selectedGy}-${pad2(selectedGm)}`;
  }

  function processSalaryDateSummary(form) {
    if (!(form instanceof HTMLFormElement)) return;

    const labels = Array.from(form.querySelectorAll(".salary-label"));

    for (const label of labels) {
      const labelText = (label.textContent || "").trim().toLowerCase();

      if (labelText !== "start date" && labelText !== "end date") {
        continue;
      }

      const value = label.nextElementSibling;

      if (!(value instanceof HTMLElement) ||
          !value.classList.contains("salary-value")) {
        continue;
      }

      const raw =
        value.getAttribute("data-kpc-monthly-original-value") ||
        value.textContent?.trim() ||
        "";

      const parsed = parseYearMonth(raw);
      if (!parsed) continue;

      if (!value.hasAttribute("data-kpc-monthly-original-value")) {
        value.setAttribute("data-kpc-monthly-original-value", raw);
      }

      value.textContent =
        gregorianMonthRangeLabel(parsed.gy, parsed.gm, true);

      value.title = `میلادی: ${raw}`;
      value.setAttribute("data-kpc-monthly-summary", "true");
    }
  }

  function processMonthlyForms(root) {
    if (!(root instanceof Element)) return;

    const forms = [];

    if (root instanceof HTMLFormElement) {
      forms.push(root);
    }

    root.querySelectorAll?.("form").forEach(form => forms.push(form));

    for (const form of forms) {
      form
        .querySelectorAll(".month-field")
        .forEach(processMonthlyStartDateField);

      processSalaryDateSummary(form);
    }
  }

  function installMonthlyFormListeners() {
    document.addEventListener(
      "change",
      event => {
        const target = event.target;

        if (!(target instanceof HTMLSelectElement) &&
            !(target instanceof HTMLInputElement)) {
          return;
        }

        const form = target.closest("form");
        if (!form) return;

        setTimeout(() => processMonthlyForms(form), 0);
        setTimeout(() => processMonthlyForms(form), 80);
        setTimeout(() => processMonthlyForms(form), 250);
      },
      true
    );
  }

  // -----------------------------
  // Vue DatePicker adapter
  // -----------------------------

  function parseGregorianCell(cell) {
    const value =
      cell.getAttribute("data-test-id") ||
      cell.id ||
      "";

    const match = value.match(/dp-(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;

    return {
      gy: Number(match[1]),
      gm: Number(match[2]),
      gd: Number(match[3]),
      iso: `${match[1]}-${match[2]}-${match[3]}`
    };
  }

  function findSelectedGregorianDate(menu) {
    const selected =
      menu.querySelector('.dp__calendar_item[aria-selected="true"]') ||
      menu.querySelector(".dp__active_date")?.closest(".dp__calendar_item");

    if (selected) {
      const parsed = parseGregorianCell(selected);
      if (parsed) return parsed;
    }

    const firstCurrent =
      menu.querySelector(".dp__calendar_item:not(.dp__cell_offset)") ||
      menu.querySelector('.dp__calendar_item[data-test-id^="dp-"]');

    return firstCurrent ? parseGregorianCell(firstCurrent) : null;
  }

  function findDateInput(menu) {
    const main =
      menu.closest(".dp__main") ||
      document.querySelector(".dp__main:has(.dp__menu)");

    if (main) {
      const input = main.querySelector(
        'input.dp__input, input[type="text"], input[type="date"]'
      );
      if (input) return input;
    }

    const active = document.activeElement;
    if (active instanceof HTMLInputElement) return active;

    return null;
  }

  function setNativeInputValue(input, value) {
    if (!(input instanceof HTMLInputElement)) return false;

    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    );

    descriptor?.set?.call(input, value);

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));

    return true;
  }

  function clickOriginalGregorianCell(menu, gy, gm, gd) {
    const iso = `${gy}-${pad2(gm)}-${pad2(gd)}`;

    const selectors = [
      `[data-test-id="dp-${iso}"]`,
      `#dp-${CSS.escape(iso)}`
    ];

    for (const selector of selectors) {
      const cell = menu.querySelector(selector);
      if (cell instanceof HTMLElement) {
        cell.click();
        return true;
      }
    }

    return false;
  }

  function findNavigationButton(menu, direction) {
    /*
      دکمه‌های DatePicker اصلی در کل menu جست‌وجو می‌شوند.
      فقط عناصر داخل تقویم شمسی اکستنشن حذف می‌شوند.
    */
    const isOriginalElement = element =>
      element instanceof HTMLElement &&
      !element.closest(".kpc-jalali-calendar");

    /*
      Vue DatePicker معمولاً دکمه‌های قبل و بعد را با dp__inner_nav می‌سازد.
    */
    const innerNavButtons = Array.from(
      menu.querySelectorAll(".dp__inner_nav")
    ).filter(isOriginalElement);

    if (innerNavButtons.length) {
      const labelled = innerNavButtons.find(element => {
        const label = [
          element.getAttribute("aria-label"),
          element.getAttribute("title"),
          element.getAttribute("data-test-id")
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return direction === "next"
          ? /next|right|بعد/.test(label)
          : /prev|previous|left|قبل/.test(label);
      });

      if (labelled) return labelled;

      /*
        در Vue DatePicker ترتیب استاندارد:
        اولین دکمه = ماه قبل
        آخرین دکمه = ماه بعد
      */
      if (innerNavButtons.length >= 2) {
        return direction === "next"
          ? innerNavButtons[innerNavButtons.length - 1]
          : innerNavButtons[0];
      }

      /*
        اگر فقط یک دکمه وجود داشت، از جهت آیکن SVG کمک می‌گیریم.
      */
      if (innerNavButtons.length === 1) {
        const button = innerNavButtons[0];
        const html = button.innerHTML.toLowerCase();
        const label = (
          button.getAttribute("aria-label") ||
          button.getAttribute("title") ||
          ""
        ).toLowerCase();

        const looksNext = /next|right|بعد|chevron-right/.test(label + html);
        const looksPrev = /prev|previous|left|قبل|chevron-left/.test(label + html);

        if (
          (direction === "next" && looksNext) ||
          (direction === "prev" && looksPrev)
        ) {
          return button;
        }
      }
    }

    /*
      fallback بر اساس data-test-id و aria-label
    */
    const allCandidates = Array.from(
      menu.querySelectorAll("button, [role='button']")
    ).filter(isOriginalElement);

    const patterns =
      direction === "next"
        ? /next|right|بعد/i
        : /prev|previous|left|قبل/i;

    const labelledCandidate = allCandidates.find(element => {
      const label = [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("data-test-id"),
        typeof element.className === "string" ? element.className : ""
      ]
        .filter(Boolean)
        .join(" ");

      return patterns.test(label);
    });

    if (labelledCandidate) return labelledCandidate;

    /*
      fallback نهایی: دکمه‌های ردیف ماه/سال بر اساس ترتیب DOM
    */
    const rowButtons = Array.from(
      menu.querySelectorAll(
        ".dp__month_year_row button, .dp__month_year_wrap button"
      )
    ).filter(isOriginalElement);

    if (rowButtons.length >= 2) {
      return direction === "next"
        ? rowButtons[rowButtons.length - 1]
        : rowButtons[0];
    }

    return null;
  }

  function getOriginalCalendarMonth(menu) {
    /*
      سلول‌های offset متعلق به ماه قبل یا بعد هستند و نباید
      برای تشخیص ماه فعال استفاده شوند.
    */
    const currentMonthCells = Array.from(
      menu.querySelectorAll(
        '.dp__calendar_item[data-test-id^="dp-"]:not(.dp__cell_offset)'
      )
    )
      .map(parseGregorianCell)
      .filter(Boolean);

    if (currentMonthCells.length) {
      const counts = new Map();

      for (const date of currentMonthCells) {
        const key = `${date.gy}-${date.gm}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }

      const dominant = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0];

      if (dominant) {
        const [gy, gm] = dominant.split("-").map(Number);
        return { gy, gm };
      }
    }

    const active = menu.querySelector(
      '.dp__calendar_item[aria-selected="true"], .dp__active_date'
    );

    const activeCell =
      active?.classList?.contains("dp__calendar_item")
        ? active
        : active?.closest?.(".dp__calendar_item");

    return activeCell ? parseGregorianCell(activeCell) : null;
  }

  async function waitForOriginalCalendarMonthChange(
    menu,
    previousGy,
    previousGm
  ) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 25));

      const current = getOriginalCalendarMonth(menu);

      if (
        current &&
        (current.gy !== previousGy || current.gm !== previousGm)
      ) {
        return current;
      }
    }

    return getOriginalCalendarMonth(menu);
  }

  async function moveOriginalCalendarTo(menu, targetGy, targetGm) {
    let guard = 0;

    while (guard < 48) {
      guard += 1;

      /*
        ممکن است تاریخ مقصد در سلول‌های واقعی همین رندر موجود باشد.
      */
      const targetIso = `${targetGy}-${pad2(targetGm)}`;
      const exactMonthCell = menu.querySelector(
        `.dp__calendar_item[data-test-id^="dp-${targetIso}-"]:not(.dp__cell_offset)`
      );

      if (exactMonthCell) return true;

      const current = getOriginalCalendarMonth(menu);
      if (!current) return false;

      if (current.gy === targetGy && current.gm === targetGm) {
        return true;
      }

      const currentIndex = current.gy * 12 + (current.gm - 1);
      const targetIndex = targetGy * 12 + (targetGm - 1);
      const direction = targetIndex > currentIndex ? "next" : "prev";
      const button = findNavigationButton(menu, direction);

      if (!(button instanceof HTMLElement)) {
        return false;
      }

      button.click();

      const changed = await waitForOriginalCalendarMonthChange(
        menu,
        current.gy,
        current.gm
      );

      if (
        !changed ||
        (changed.gy === current.gy && changed.gm === current.gm)
      ) {
        return false;
      }
    }

    return false;
  }

  function getSaturdayColumnIndex(date) {
    // JS: Sunday=0 ... Saturday=6
    // Persian calendar: Saturday=0 ... Friday=6
    return (date.getDay() + 1) % 7;
  }

  function buildJalaliCalendar(menu, initialJalali) {
    const shell = document.createElement("div");
    shell.className = "kpc-jalali-calendar";
    shell.dir = "rtl";

    const state = {
      jy: initialJalali.jy,
      jm: initialJalali.jm
    };

    shell.innerHTML = `
      <div class="kpc-header">
        <button type="button" class="kpc-nav kpc-next" aria-label="ماه بعد">‹</button>
        <div class="kpc-title"></div>
        <button type="button" class="kpc-nav kpc-prev" aria-label="ماه قبل">›</button>
      </div>
      <div class="kpc-weekdays"></div>
      <div class="kpc-days"></div>
      <div class="kpc-footer">
        <button type="button" class="kpc-today">امروز</button>
      </div>
    `;

    const title = shell.querySelector(".kpc-title");
    const weekdays = shell.querySelector(".kpc-weekdays");
    const days = shell.querySelector(".kpc-days");

    weekdayNames.forEach(name => {
      const cell = document.createElement("div");
      cell.className = "kpc-weekday";
      cell.textContent = name;
      weekdays.appendChild(cell);
    });

    async function selectJalaliDate(jy, jm, jd) {
      if (!isValidJalaaliDate(jy, jm, jd)) return;

      const { gy, gm, gd } = toGregorian(jy, jm, jd);

      if (clickOriginalGregorianCell(menu, gy, gm, gd)) {
        return;
      }

      const moved = await moveOriginalCalendarTo(menu, gy, gm);

      if (moved && clickOriginalGregorianCell(menu, gy, gm, gd)) {
        return;
      }

      const input = findDateInput(menu);
      if (input) {
        const iso = `${gy}-${pad2(gm)}-${pad2(gd)}`;
        setNativeInputValue(input, iso);

        input.dispatchEvent(
          new CustomEvent("kpc-date-selected", {
            bubbles: true,
            detail: { gy, gm, gd, jy, jm, jd, iso }
          })
        );
      }

      document.body.click();
    }

    function render() {
      title.textContent = `${persianMonths[state.jm - 1]} ${toFaDigits(state.jy)}`;
      days.innerHTML = "";

      const firstGregorian = toGregorian(state.jy, state.jm, 1);
      const firstDate = new Date(
        firstGregorian.gy,
        firstGregorian.gm - 1,
        firstGregorian.gd,
        12
      );

      const offset = getSaturdayColumnIndex(firstDate);
      const currentMonthLength = jalaaliMonthLength(state.jy, state.jm);

      let prevJy = state.jy;
      let prevJm = state.jm - 1;
      if (prevJm < 1) {
        prevJm = 12;
        prevJy -= 1;
      }

      let nextJy = state.jy;
      let nextJm = state.jm + 1;
      if (nextJm > 12) {
        nextJm = 1;
        nextJy += 1;
      }

      const prevLength = jalaaliMonthLength(prevJy, prevJm);
      const today = new Date();
      const todayJ = toJalaali(
        today.getFullYear(),
        today.getMonth() + 1,
        today.getDate()
      );

      for (let index = 0; index < 42; index += 1) {
        let jy = state.jy;
        let jm = state.jm;
        let jd;
        let outside = false;

        if (index < offset) {
          jy = prevJy;
          jm = prevJm;
          jd = prevLength - offset + index + 1;
          outside = true;
        } else if (index >= offset + currentMonthLength) {
          jy = nextJy;
          jm = nextJm;
          jd = index - offset - currentMonthLength + 1;
          outside = true;
        } else {
          jd = index - offset + 1;
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "kpc-day";
        button.textContent = toFaDigits(jd);
        button.dataset.jy = String(jy);
        button.dataset.jm = String(jm);
        button.dataset.jd = String(jd);

        if (outside) button.classList.add("kpc-outside");

        if (
          jy === todayJ.jy &&
          jm === todayJ.jm &&
          jd === todayJ.jd
        ) {
          button.classList.add("kpc-today-cell");
        }

        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          selectJalaliDate(jy, jm, jd);
        });

        days.appendChild(button);
      }
    }

    shell.querySelector(".kpc-prev").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      state.jm -= 1;
      if (state.jm < 1) {
        state.jm = 12;
        state.jy -= 1;
      }
      render();
    });

    shell.querySelector(".kpc-next").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      state.jm += 1;
      if (state.jm > 12) {
        state.jm = 1;
        state.jy += 1;
      }
      render();
    });

    shell.querySelector(".kpc-today").addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const today = new Date();
      const todayJ = toJalaali(
        today.getFullYear(),
        today.getMonth() + 1,
        today.getDate()
      );

      state.jy = todayJ.jy;
      state.jm = todayJ.jm;
      render();
    });

    render();
    return shell;
  }

  function installJalaliCalendar(menu) {
    if (!(menu instanceof HTMLElement)) return;
    if (menu.hasAttribute(KPC.calendarReady)) return;

    const selected = findSelectedGregorianDate(menu);
    if (!selected) {
      console.debug(`${KPC.prefix} DatePicker date not detected`, menu);
      return;
    }

    const initialJalali = toJalaali(selected.gy, selected.gm, selected.gd);
    const shell = buildJalaliCalendar(menu, initialJalali);

    menu.setAttribute(KPC.calendarReady, "true");
    menu.classList.add("kpc-datepicker-host");
    menu.appendChild(shell);
  }

  function scanDatePickers(root = document) {
    const menus = [];

    if (root instanceof Element && root.matches(".dp__menu")) {
      menus.push(root);
    }

    root.querySelectorAll?.(".dp__menu").forEach(menu => menus.push(menu));
    menus.forEach(installJalaliCalendar);
  }

  function processElement(root) {
    if (!root) return;

    if (root.nodeType === Node.TEXT_NODE) {
      processTextNode(root);
      return;
    }

    if (!(root instanceof Element)) return;

    scanDatePickers(root);
    processDatePickerInputs(root);
    processGregorianPeriodFilters(root);
    processFullCalendars(root);
    processScheduleTimelines(root);
    processMonthlyForms(root);
    processTooltipTree(root);
    processCompactTaskDates(root);

    if (shouldIgnoreElement(root)) return;

    if (root.matches("time[datetime]")) {
      processTimeElement(root);
    }

    root.querySelectorAll?.("time[datetime]").forEach(processTimeElement);

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || shouldIgnoreElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        const value = node.nodeValue || "";

        if (!/\d{4}|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(value)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(processTextNode);
  }

  let scheduled = false;
  const pendingRoots = new Set();

  function queueProcess(node) {
    pendingRoots.add(node);

    if (scheduled) return;

    scheduled = true;

    requestAnimationFrame(() => {
      scheduled = false;
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();
      roots.forEach(processElement);
    });
  }

  function installObserver() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(queueProcess);
        } else if (mutation.type === "characterData") {
          queueProcess(mutation.target);
        } else if (mutation.type === "attributes") {
          queueProcess(mutation.target);
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        "datetime",
        "title",
        "aria-label",
        "data-original-title",
        "data-tooltip",
        "data-tippy-content",
        "data-tooltip-content",
        "placeholder",
        "data-kpc-original-title",
        "data-test-id",
        "aria-selected"
      ]
    });
  }

  function init() {
    processElement(document.body);
    scanDatePickers(document);
    processDatePickerInputs(document.body);
    processGregorianPeriodFilters(document.body);
    processFullCalendars(document.body);
    processScheduleTimelines(document.body);
    processMonthlyForms(document.body);
    installDatePickerInputListeners();
    installGregorianPeriodFilterListeners();
    installFullCalendarListeners();
    installScheduleListeners();
    installMonthlyFormListeners();
    installObserver();

    /*
      Vue گاهی property مربوط به value را بدون تغییر DOM attribute
      بازنویسی می‌کند. این بررسی سبک فقط inputهای DatePicker را کنترل می‌کند.
    */
    setInterval(() => {
      document
        .querySelectorAll('input[data-test-id="dp-input"], input.dp__input')
        .forEach(processDatePickerInput);

      processGregorianPeriodFilters(document.body);
      processFullCalendars(document.body);
      processScheduleTimelines(document.body);
      processMonthlyForms(document.body);
    }, 300);

    console.info(`${KPC.prefix} v1.1.0 initialized`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
    }
  );
})();
