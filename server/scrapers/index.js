// server/scrapers/index.js
//
// Registry of all Telegram channel scrapers.
// The scheduler crawls EVERY scraper in this list on each cycle; checkpoints
// are stored per scraper id (config.lastSeenMessageId[scraperId]).
//
// To add a channel: create server/scrapers/<id>/index.js exporting a scraper
// object ({ id, name, channelUrl, domainKeyword, parseTelegramHtml, ...
// optional: messageOnly, extractCompanyName, normalizeMessageText }) and
// register it here. See hahujobs/index.js for a message-only example.

import { elelanajobsScraper } from './elelanajobs/index.js';
import { hahujobsScraper } from './hahujobs/index.js';

export const SCRAPERS = [elelanajobsScraper, hahujobsScraper];

export function getScraperById(id) {
  return SCRAPERS.find((s) => s.id === id);
}

export function getScraperForUrl(url) {
  return SCRAPERS.find((s) => url.toLowerCase().includes(s.domainKeyword.toLowerCase()));
}
