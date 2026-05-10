import JSZip from "jszip";
import type { Lead } from "@/types";

type TemplateType = "react-vite" | "html-injectable";

function detectTemplateType(zip: JSZip): TemplateType {
  const files = Object.keys(zip.files);
  const hasBusinessConfig = files.some((f) => f.includes("businessConfig.ts") || f.includes("businessConfig.js"));
  const hasViteConfig = files.some((f) => f.includes("vite.config"));
  if (hasBusinessConfig || hasViteConfig) return "react-vite";
  return "html-injectable";
}

function getAccentColor(category: string): string {
  const colors: Record<string, string> = {
    restaurant: "#f59e0b", salon: "#ec4899", plumber: "#3b82f6",
    electrician: "#f59e0b", dentist: "#06b6d4", gym: "#ef4444",
    retail: "#8b5cf6", "real-estate": "#10b981", lawyer: "#6366f1", other: "#3b82f6",
  };
  return colors[category] ?? "#3b82f6";
}

function getHeroImage(category: string): string {
  const images: Record<string, string> = {
    restaurant: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=2000",
    salon: "https://images.unsplash.com/photo-1560066984-138daaa0e88b?auto=format&fit=crop&q=80&w=2000",
    plumber: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?auto=format&fit=crop&q=80&w=2000",
    electrician: "https://images.unsplash.com/photo-1621905252507-b35492cc74b4?auto=format&fit=crop&q=80&w=2000",
    dentist: "https://images.unsplash.com/photo-1606811841689-23dfddce3e66?auto=format&fit=crop&q=80&w=2000",
    gym: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=2000",
    retail: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=2000",
    "real-estate": "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=2000",
    lawyer: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=2000",
    other: "https://images.unsplash.com/photo-1520340356584-f9917d1eea6f?auto=format&fit=crop&q=80&w=2000",
  };
  return images[category] ?? images.other;
}

function getGalleryImage(category: string): string {
  const images: Record<string, string> = {
    restaurant: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=800",
    salon: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=800",
    plumber: "https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?auto=format&fit=crop&q=80&w=800",
    electrician: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=800",
    dentist: "https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=800",
    gym: "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?auto=format&fit=crop&q=80&w=800",
    retail: "https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?auto=format&fit=crop&q=80&w=800",
    "real-estate": "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&q=80&w=800",
    lawyer: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&q=80&w=800",
    other: "https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80&w=800",
  };
  return images[category] ?? images.other;
}

function generateStatsHtml(): string {
  return [
    { value: "500+", label: "Customers Served" },
    { value: "5★", label: "Average Rating" },
    { value: "100%", label: "Satisfaction Rate" },
    { value: "10+", label: "Years Experience" },
  ].map(s => `<div class="stat-item"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join("");
}

function generateServicesHtml(lead: Lead): string {
  const svgStar = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="24" height="24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const svgShield = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="24" height="24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  const svgZap = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="24" height="24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  const svgHeart = `<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" width="24" height="24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>`;

  const categoryServices: Record<string, Array<{icon:string;title:string;description:string;price:string}>> = {
    restaurant: [
      { icon: svgStar, title: "Signature Dishes", description: "Chef-crafted meals using the freshest local ingredients.", price: "From $18" },
      { icon: svgHeart, title: "Private Dining", description: "Exclusive private dining rooms for special events.", price: "From $200" },
      { icon: svgZap, title: "Express Lunch", description: "Quick yet delicious options for busy professionals.", price: "From $12" },
      { icon: svgShield, title: "Catering", description: "Full-service catering for events of any size.", price: "From $500" },
    ],
    salon: [
      { icon: svgStar, title: "Cut & Style", description: "Expert haircuts and styling tailored to your look.", price: "From $45" },
      { icon: svgHeart, title: "Color & Highlights", description: "Professional color treatments for vibrant results.", price: "From $89" },
      { icon: svgZap, title: "Blowout", description: "Luxurious blowout with deep conditioning treatment.", price: "From $55" },
      { icon: svgShield, title: "Keratin Treatment", description: "Smoothing treatment for frizz-free, shiny hair.", price: "From $199" },
    ],
    plumber: [
      { icon: svgZap, title: "Emergency Repair", description: "24/7 emergency repairs — fast response guaranteed.", price: "From $99" },
      { icon: svgStar, title: "Installation", description: "Professional installation of all plumbing systems.", price: "From $149" },
      { icon: svgShield, title: "Drain Cleaning", description: "High-pressure cleaning for all drain types.", price: "From $79" },
      { icon: svgHeart, title: "Full Inspection", description: "Comprehensive plumbing inspection and report.", price: "From $129" },
    ],
    electrician: [
      { icon: svgZap, title: "Emergency Call-out", description: "24/7 electrical emergency response service.", price: "From $99" },
      { icon: svgStar, title: "Wiring & Rewiring", description: "Complete home and commercial wiring solutions.", price: "From $249" },
      { icon: svgShield, title: "Safety Inspection", description: "Full electrical safety audit and certification.", price: "From $149" },
      { icon: svgHeart, title: "Smart Home", description: "Smart home automation and installation services.", price: "From $299" },
    ],
    dentist: [
      { icon: svgStar, title: "General Checkup", description: "Comprehensive dental examination and cleaning.", price: "From $79" },
      { icon: svgHeart, title: "Teeth Whitening", description: "Professional whitening for a brighter smile.", price: "From $199" },
      { icon: svgShield, title: "Orthodontics", description: "Braces and aligners for a perfect smile.", price: "From $999" },
      { icon: svgZap, title: "Emergency Care", description: "Same-day emergency dental treatment.", price: "From $149" },
    ],
    gym: [
      { icon: svgStar, title: "Personal Training", description: "1-on-1 sessions with certified fitness coaches.", price: "From $60/hr" },
      { icon: svgHeart, title: "Group Classes", description: "High-energy group fitness classes daily.", price: "From $15/class" },
      { icon: svgZap, title: "HIIT & Cardio", description: "High-intensity interval training programs.", price: "From $25/class" },
      { icon: svgShield, title: "Nutrition Plan", description: "Custom meal and nutrition planning service.", price: "From $99" },
    ],
  };

  const services = categoryServices[lead.category] ?? [
    { icon: svgStar, title: "Premium Service", description: "Top-quality professional service tailored to your needs.", price: "From $99" },
    { icon: svgShield, title: "Full Protection", description: "Comprehensive care and protection long-term.", price: "From $149" },
    { icon: svgZap, title: "Express Service", description: "Fast and efficient without compromising quality.", price: "From $69" },
    { icon: svgHeart, title: "VIP Treatment", description: "The ultimate premium white-glove experience.", price: "From $299" },
  ];

  return services.map(s => `
    <div class="glass-card service-card">
      <div class="service-icon">${s.icon}</div>
      <h3 class="service-title">${s.title}</h3>
      <p class="service-desc">${s.description}</p>
      <hr class="service-divider" />
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span class="service-price">${s.price}</span>
        <a href="tel:${lead.phone ?? ""}" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--zinc-500);text-decoration:none;">Book →</a>
      </div>
    </div>`).join("");
}

function generatePackagesHtml(lead: Lead): string {
  const packages = [
    { name: "Basic", subtitle: "The Essential Package", price: "$99", popular: false,
      features: ["Initial Consultation", "Core Service Delivery", "Standard Materials", "1 Follow-up Visit", "Email Support"] },
    { name: "Pro", subtitle: "Most Popular Choice", price: "$199", popular: true,
      features: ["Everything in Basic", "Priority Scheduling", "Premium Materials", "3 Follow-up Visits", "Phone & Email Support", "Satisfaction Guarantee"] },
    { name: "Elite", subtitle: "The Ultimate Package", price: "$349", popular: false,
      features: ["Everything in Pro", "VIP Priority Access", "Top-tier Materials", "Unlimited Follow-ups", "Dedicated Account Manager", "Annual Maintenance Plan"] },
  ];
  const checkSvg = `<svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
  return packages.map(pkg => `
    <div class="pricing-card ${pkg.popular ? "popular" : ""}">
      ${pkg.popular ? '<div class="popular-badge">⭐ Most Popular</div>' : ""}
      <div class="package-name">${pkg.name}</div>
      <div class="package-subtitle">${pkg.subtitle}</div>
      <div class="package-price">${pkg.price}</div>
      <ul class="package-features">
        ${pkg.features.map(f => `<li class="package-feature"><div class="feature-check">${checkSvg}</div>${f}</li>`).join("")}
      </ul>
      <a href="tel:${lead.phone ?? ""}" class="package-btn ${pkg.popular ? "primary" : "secondary"}">Select ${pkg.name}</a>
    </div>`).join("");
}

function generateReviewsHtml(lead: Lead): string {
  const starSvg = `<svg class="star" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  const stars = Array(5).fill(starSvg).join("");
  const reviews = [
    { author: "Michael R.", comment: `Best ${lead.category} in ${lead.city}. Absolutely incredible — highly recommend!`, date: "2 days ago" },
    { author: "Sarah J.", comment: `${lead.company_name} exceeded all my expectations. Professional and thorough.`, date: "1 week ago" },
    { author: "David K.", comment: `I've tried many places but ${lead.company_name} is the best. Will definitely return!`, date: "2 weeks ago" },
    { author: "Emma L.", comment: `Fast, professional, and amazing results. Worth every penny. Book them!`, date: "3 weeks ago" },
  ];
  return reviews.map(r => `
    <div class="glass-card review-card">
      <div class="stars">${stars}</div>
      <p class="review-text">"${r.comment}"</p>
      <div class="review-author">
        <div class="author-avatar">${r.author[0]}</div>
        <div><div class="author-name">${r.author}</div><div class="author-date">${r.date}</div></div>
      </div>
    </div>`).join("");
}

function generateBeforeAfterHtml(category: string): string {
  const images: Record<string, {before:string;after:string}> = {
    restaurant: { before: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&q=80&w=800", after: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&q=80&w=800" },
    salon: { before: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&q=80&w=800", after: "https://images.unsplash.com/photo-1560066984-138daaa0e88b?auto=format&fit=crop&q=80&w=800" },
    other: { before: "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?auto=format&fit=crop&q=80&w=800", after: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&q=80&w=800" },
  };
  const img = images[category] ?? images.other;
  return `
    <div class="ba-item"><img src="${img.before}" alt="Before" loading="lazy" /><div class="ba-label before">Before</div></div>
    <div class="ba-item"><img src="${img.after}" alt="After" loading="lazy" /><div class="ba-label after">After</div></div>`;
}

function generateSocialsHtml(): string {
  return `
    <a href="#" class="social-btn" title="Instagram"><svg fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
    <a href="#" class="social-btn" title="Facebook"><svg fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>`;
}

function buildPlaceholderMap(lead: Lead): Record<string, string> {
  const slug = lead.company_name.toLowerCase().replace(/\s+/g, "-");
  const year = new Date().getFullYear().toString();
  return {
    "{{BUSINESS_NAME}}": lead.company_name, "{{COMPANY_NAME}}": lead.company_name,
    "{{CITY}}": lead.city, "{{PHONE}}": lead.phone ?? "", "{{EMAIL}}": lead.email ?? "",
    "{{WEBSITE}}": lead.website ?? "", "{{COMPANY_SLUG}}": slug,
    "{{CURRENT_YEAR}}": year, "{{YEAR}}": year, "{{CATEGORY}}": lead.category,
    "{{TAGLINE}}": `Your trusted ${lead.category} in ${lead.city}`,
    "{{HERO_TITLE}}": `${lead.company_name.toUpperCase()} — ${lead.city.toUpperCase()}`,
    "{{HERO_SUBTITLE}}": `Premium ${lead.category} services in ${lead.city}. Professional, reliable, and trusted by hundreds of local customers.`,
    "{{HERO_IMAGE}}": getHeroImage(lead.category),
    "{{ACCENT_COLOR}}": getAccentColor(lead.category),
    "{{YEARS_IN_BUSINESS}}": "10",
    "{{BOOKING_LINK}}": `tel:${lead.phone ?? ""}`,
    "{{ADDRESS}}": lead.city,
    "{{GOOGLE_MAPS_LINK}}": `https://maps.google.com/?q=${encodeURIComponent(lead.company_name + " " + lead.city)}`,
    "{{WHATSAPP}}": (lead.phone ?? "").replace(/[^0-9]/g, ""),
    "{{HOURS_WEEKDAY}}": "Mon – Fri: 8:00 AM – 7:00 PM",
    "{{HOURS_WEEKEND}}": "Sat – Sun: 9:00 AM – 4:00 PM",
    "{{GALLERY_IMAGE_1}}": getGalleryImage(lead.category),
    "{{STATS_HTML}}": generateStatsHtml(),
    "{{SERVICES_HTML}}": generateServicesHtml(lead),
    "{{PACKAGES_HTML}}": generatePackagesHtml(lead),
    "{{REVIEWS_HTML}}": generateReviewsHtml(lead),
    "{{BEFORE_AFTER_HTML}}": generateBeforeAfterHtml(lead.category),
    "{{SOCIALS_HTML}}": generateSocialsHtml(),
  };
}

function patchBusinessConfig(content: string, lead: Lead): string {
  const slug = lead.company_name.toLowerCase().replace(/\s+/g, "-");
  const email = lead.email ?? `contact@${slug}.com`;
  const phone = lead.phone ?? "";
  const whatsapp = phone.replace(/[^0-9]/g, "");
  const replacements: Array<[RegExp, string]> = [
    [/(business_name:\s*")[^"]*(")/g, `$1${lead.company_name}$2`],
    [/(city:\s*")[^"]*(")/g, `$1${lead.city}$2`],
    [/(phone:\s*")[^"]*(")/g, `$1${phone}$2`],
    [/(whatsapp:\s*")[^"]*(")/g, `$1${whatsapp}$2`],
    [/(email:\s*")[^"]*(")/g, `$1${email}$2`],
    [/(hero_title:\s*")[^"]*(")/g, `$1${lead.company_name.toUpperCase()} — ${lead.city.toUpperCase()}$2`],
    [/(tagline:\s*")[^"]*(")/g, `$1Your trusted ${lead.category} in ${lead.city}$2`],
    [/(address:\s*")[^"]*(")/g, `$1${lead.city}$2`],
    [/(hero_subtitle:\s*")[^"]*(")/g, `$1Premium ${lead.category} services in ${lead.city}. Contact us today.$2`],
    [/(tagline:\s*")[^"]*(")/g, `$1Your trusted ${lead.category} in ${lead.city}$2`],
    [/(founding_year:\s*")[^"]*(")/g, `$12015$2`],
    [/(booking_link:\s*")[^"]*(")/g, `$1tel:${phone}$2`],
    [/(google_maps_link:\s*")[^"]*(")/g, `$1https://maps.google.com/?q=${encodeURIComponent(lead.company_name + ' ' + lead.city)}$2`],
    [/(hours_weekday:\s*")[^"]*(")/g, `$1Mon – Fri: 9:00 AM – 7:00 PM$2`],
    [/(hours_weekend:\s*")[^"]*(")/g, `$1Sat – Sun: 10:00 AM – 5:00 PM$2`],
    [/(about_image:\s*")[^"]*(")/g, `$1https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&q=85&w=900$2`],
    [/(cinematic_image:\s*")[^"]*(")/g, `$1https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&q=85&w=2400$2`],
    [/(experience_image:\s*")[^"]*(")/g, `$1https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&q=85&w=900$2`],
    [/(hero_image:\s*")[^"]*(")/g, `$1${getHeroImage(lead.category)}$2`],
    [/(accent_color:\s*")[^"]*(")/g, `$1${getAccentColor(lead.category)}$2`],
  ];
  let result = content;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function patchIndexHtml(content: string, lead: Lead): string {
  return content
    .replace(/<title>[^<]*<\/title>/, `<title>${lead.company_name} | ${lead.city}</title>`)
    .replace(/My Google AI Studio App/g, lead.company_name);
}

export async function detectPlaceholders(zipBuffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const type = detectTemplateType(zip);
  if (type === "react-vite") {
    return ["business_name", "city", "phone", "email", "whatsapp", "hero_title", "tagline", "address"];
  }
  const tokens = new Set<string>();
  const pattern = /\{\{[A-Z_a-z]+\}\}/g;
  for (const [, file] of Object.entries(zip.files)) {
    if ((file as any).dir || !isTextFile(file.name)) continue;
    const content = await (file as any).async("text");
    const matches = content.match(pattern);
    if (matches) matches.forEach((m: string) => tokens.add(m));
  }
  return Array.from(tokens);
}

export async function processTemplate(templateBuffer: ArrayBuffer, lead: Lead): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const templateType = detectTemplateType(zip);
  const outputZip = new JSZip();
  const placeholderMap = buildPlaceholderMap(lead);

  // Detect if all files live inside a single root folder — if so, strip that prefix
  // so index.html ends up at the root of the output ZIP (required for Netlify deploy)
  const allFiles = Object.keys(zip.files).filter(f => !zip.files[f].dir);
  const rootFolders = new Set(allFiles.map(f => f.split("/")[0]));
  const hasSingleRoot = rootFolders.size === 1 && allFiles.every(f => f.includes("/"));
  const rootPrefix = hasSingleRoot ? [...rootFolders][0] + "/" : "";

  for (const [filename, file] of Object.entries(zip.files)) {
    if ((file as any).dir) continue; // skip directory entries

    // Strip root folder prefix if present
    const outputName = rootPrefix && filename.startsWith(rootPrefix)
      ? filename.slice(rootPrefix.length)
      : filename;

    if (!outputName) continue; // skip the root folder itself

    if (!isTextFile(filename)) {
      const content = await (file as any).async("arraybuffer");
      outputZip.file(outputName, content);
      continue;
    }

    let content = await (file as any).async("text");

    if (templateType === "react-vite") {
      const baseName = filename.split("/").pop() ?? "";
      if (baseName === "businessConfig.ts" || baseName === "businessConfig.js") content = patchBusinessConfig(content, lead);
      else if (baseName === "index.html") content = patchIndexHtml(content, lead);
      outputZip.file(outputName, content);
    } else {
      // HTML injectable: replace all {{PLACEHOLDER}} tokens
      let result = content;
      for (const [token, value] of Object.entries(placeholderMap)) result = result.replaceAll(token, value);
      let processedName = outputName;
      for (const [token, value] of Object.entries(placeholderMap)) processedName = processedName.replaceAll(token, value);
      outputZip.file(processedName, result);
    }
  }
    // Add vercel.json for static site serving
  outputZip.file("vercel.json", JSON.stringify({
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }, null, 2));
  return outputZip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function isTextFile(filename: string): boolean {
  const textExts = [".html", ".htm", ".css", ".js", ".ts", ".jsx", ".tsx", ".json", ".xml", ".txt", ".md", ".svg", ".php", ".env", ".yml", ".yaml", ".toml", ".njk", ".hbs", ".ejs"];
  return textExts.some((ext) => filename.toLowerCase().endsWith(ext));
}
// Note: patchBusinessConfig already handles business_name, city, phone, email, whatsapp
// The restaurant template uses additional fields — extend the patch
