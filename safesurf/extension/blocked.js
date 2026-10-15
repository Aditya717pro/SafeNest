/**
 * SafeSurf - Blocked Interstitial Logic
 * 
 * Safely parses target information, displays context, presents mindfulness
 * reset prompts, and enables secure navigation away from explicit destinations.
 */

// Curated mindfulness and focus quotes
const MOTIVATIONAL_QUOTES = [
  '"The secret of change is to focus all of your energy not on fighting the old, but on building the new." — Socrates',
  '"Self-discipline is the bridge between goals and accomplishment." — Jim Rohn',
  '"You have power over your mind, not outside events. Realize this, and you will find strength." — Marcus Aurelius',
  '"Small disciplines repeated with consistency every day lead to great achievements." — John C. Maxwell',
  '"Take a deep breath. Focus on your long-term goals and stay true to your purpose."'
];

document.addEventListener('DOMContentLoaded', () => {
  const blockedUrlEl = document.getElementById('blockedUrl');
  const categoryNameEl = document.getElementById('categoryName');
  const blockedTimestampEl = document.getElementById('blockedTimestamp');
  const quoteTextEl = document.getElementById('quoteText');
  const btnGoBack = document.getElementById('btnGoBack');
  const btnSafeHome = document.getElementById('btnSafeHome');
  const linkLearnMore = document.getElementById('linkLearnMore');

  // Extract query parameters
  const params = new URLSearchParams(window.location.search);
  const attemptedUrl = params.get('url') || 'Unknown destination';
  const category = params.get('category') || 'Adult / 18+ Content';

  // Sanitize and set text content
  blockedUrlEl.textContent = attemptedUrl;
  categoryNameEl.textContent = category;

  // Format current timestamp
  const now = new Date();
  blockedTimestampEl.textContent = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    month: 'short',
    day: 'numeric'
  });

  // Pick random mindfulness quote
  const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  quoteTextEl.textContent = MOTIVATIONAL_QUOTES[randomIndex];

  // Action: Return to Safety
  btnGoBack.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'https://www.google.com';
    }
  });

  // Action: Safe Home
  btnSafeHome.addEventListener('click', () => {
    window.location.href = 'https://www.google.com';
  });

  // Action: Learn more / exceptions
  linkLearnMore.addEventListener('click', (e) => {
    e.preventDefault();
    alert('To manage domain exceptions or whitelist specific sites, click the SafeSurf icon in your browser toolbar to toggle protection or add custom domain rules.');
  });
});
