// src/utils/render.jsx
// React rendering helpers.
// Kept in a .jsx file because these functions return JSX elements.
// Pure logic helpers that don't need JSX live in text.js instead.

/**
 * Render a string that may contain **bold** markdown markers into React elements.
 * Segments wrapped in double asterisks become <strong> tags.
 *
 * Example:
 *   "Hello **world**" → ["Hello ", <strong>world</strong>]
 */
export function renderBoldMarkdown(text) {
  if (!text) return '';

  const parts = text.split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="font-bold text-slate-800">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}
