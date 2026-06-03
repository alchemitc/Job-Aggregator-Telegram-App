// server/scrapers/index.js
import { elelanajobsScraper } from './elelanajobs/index.js';

export const SCRAPERS = [elelanajobsScraper];

export function getScraperById(id) {
  return SCRAPERS.find((s) => s.id === id);
}

export function getScraperForUrl(url) {
  return SCRAPERS.find((s) => url.toLowerCase().includes(s.domainKeyword.toLowerCase()));
}
