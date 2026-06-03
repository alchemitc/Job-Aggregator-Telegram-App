// server/scrapers/elelanajobs/index.js
import * as cheerio from 'cheerio';

export const elelanajobsScraper = {
  id: 'elelanajobs',
  name: 'Elelana Jobs',
  channelUrl: 'https://t.me/s/elelanajobs',
  domainKeyword: 'elelanajobs.com',

  extractSourceDate(url) {
    const regex = /https?:\/\/elelanajobs\.com\/(\d{4})\/(\d{2})\/(\d{2})\//i;
    const match = url.match(regex);
    if (match) {
      return `${match[1]}/${match[2]}/${match[3]}`;
    }
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  },

  parseTelegramHtml($) {
    const scrapedItems = [];

    $('.tgme_widget_message_wrap').each((_, wrapper) => {
      const $wrap = $(wrapper);
      const $bubbleTextSource = $wrap.find('.tgme_widget_message_text');
      if ($bubbleTextSource.length > 0) {
        const $bubbleText = $bubbleTextSource.clone();
        $bubbleText.find('br').replaceWith('\n');
        $bubbleText.find('p, div').each((_, el) => {
          $(el).append('\n');
        });

        const text = $bubbleText.text().trim();
        const detailUrls = [];

        $bubbleTextSource.find('a').each((_, anchor) => {
          const href = $(anchor).attr('href');
          if (href && href.includes('elelanajobs.com')) {
            detailUrls.push(href);
          }
        });

        if (detailUrls.length > 0) {
          scrapedItems.push({ text, detailUrls });
        }
      }
    });

    return scrapedItems;
  },

  cleanHtmlBody($) {
    $('script, style, noscript, iframe, video, audio').remove();
    $('.sharedaddy, .wpcnt, .comments-area, #comments, .post-navigation, .related-posts').remove();

    const entryContent = $('.entry-content');
    const container =
      entryContent.length > 0
        ? entryContent
        : $('article').length > 0
        ? $('article')
        : $('body');

    if (container.length > 0) {
      const $clone = container.clone();
      $clone.find('br').replaceWith('\n');
      $clone
        .find('p, div, li, h1, h2, h3, h4, h5, h6, tr, table, section, article, blockquote')
        .each((_, el) => {
          $(el).prepend('\n').append('\n');
        });

      return $clone
        .text()
        .split('\n')
        .map((line) => line.trim())
        .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
        .join('\n')
        .trim();
    }

    return '';
  },
};
