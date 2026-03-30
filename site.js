// Set active nav link based on current path
(function setActiveNav(){
  const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  document.querySelectorAll(".nav-links a").forEach(a=>{
    const href = (a.getAttribute("href") || "").toLowerCase();
    if(href === path) a.setAttribute("aria-current","page");
  });
})();

// Build stamp (helps confirm you're viewing the latest deployed files)
// If you don't see this version on the website, you're likely seeing cached content
// or GitHub Pages hasn't deployed the new commit yet.
(function buildStamp(){
  const BUILD_ID = "v5-2026-02-02.1";
  try {
    // Console marker
    console.log("OGTT site build:", BUILD_ID);

    // Footer marker
    const footer = document.querySelector('.footer') || document.querySelector('.footerNote:last-of-type');
    if(footer && !footer.querySelector('[data-build]')){
      const s = document.createElement('span');
      s.setAttribute('data-build','1');
      s.style.marginLeft = '8px';
      s.style.opacity = '0.7';
      s.style.fontSize = '12px';
      s.textContent = `• Build ${BUILD_ID}`;
      footer.appendChild(s);
    }
  } catch(e) {}
})();

function toggleAllAccordions(open){
  document.querySelectorAll("details.accordion").forEach(d=> d.open = !!open);
}
