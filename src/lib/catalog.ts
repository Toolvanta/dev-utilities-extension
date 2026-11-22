import type { ToolCategory } from './types';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  icon: string;
  keywords: string;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  core: 'Core Tools',
  design: 'Design & Inspect',
  qa: 'QA & Debugging',
  export: 'Capture & Export',
  productivity: 'Productivity',
  extras: 'Extras',
};

export const CATEGORY_ORDER: ToolCategory[] = ['core', 'design', 'qa', 'export', 'productivity', 'extras'];

export const TOOLS: ToolDefinition[] = [
  { id: 'color-picker', name: 'Color Picker', description: 'Eyedropper, conversions, palettes', category: 'core', icon: 'Pipette', keywords: 'color eyedropper hex rgb hsl picker palette' },
  { id: 'font-picker', name: 'Font Picker', description: 'Inspect and preview page fonts', category: 'core', icon: 'Type', keywords: 'font typography family size weight inspect' },
  { id: 'screenshot', name: 'Screenshot', description: 'Viewport, full page, element', category: 'core', icon: 'Camera', keywords: 'screenshot capture png element fullpage' },

  { id: 'computed-css', name: 'Computed CSS', description: 'All computed styles of an element', category: 'design', icon: 'Code2', keywords: 'computed style css inspect' },
  { id: 'selector-copier', name: 'Selector Copier', description: 'CSS selector and XPath', category: 'design', icon: 'MousePointer2', keywords: 'selector xpath copy element' },
  { id: 'box-model', name: 'Box Model', description: 'Visualize spacing and dimensions', category: 'design', icon: 'Box', keywords: 'box model margin padding overlay measure' },
  { id: 'grid-overlay', name: 'Grid & Flex Overlay', description: 'Highlight layout containers', category: 'design', icon: 'Grid3x3', keywords: 'grid flexbox overlay layout gap' },
  { id: 'ruler', name: 'Element Ruler', description: 'Measure pixel distances', category: 'design', icon: 'Ruler', keywords: 'ruler measure distance pixels' },
  { id: 'palette-extractor', name: 'Palette Extractor', description: 'Collect colors used on the page', category: 'design', icon: 'Palette', keywords: 'palette colors extract page' },
  { id: 'contrast-checker', name: 'Contrast Checker', description: 'WCAG AA and AAA ratios', category: 'design', icon: 'Contrast', keywords: 'contrast wcag accessibility color ratio' },
  { id: 'css-generators', name: 'CSS Generators', description: 'Gradients, shadows, radii', category: 'design', icon: 'Sparkles', keywords: 'gradient shadow radius clip-path generator' },
  { id: 'css-variables', name: 'CSS Variables', description: 'Design tokens on the page', category: 'design', icon: 'Braces', keywords: 'css variables custom properties tokens' },

  { id: 'viewport-emulator', name: 'Viewport Emulator', description: 'Preview at device sizes', category: 'qa', icon: 'Monitor', keywords: 'viewport responsive device emulator screen size' },
  { id: 'image-inspector', name: 'Image Inspector', description: 'Images, sizes, alt text, srcset', category: 'qa', icon: 'Image', keywords: 'image inspect alt srcset dimensions' },
  { id: 'accessibility-audit', name: 'A11y Audit', description: 'Quick accessibility checks', category: 'qa', icon: 'Accessibility', keywords: 'accessibility a11y audit wcag labels' },
  { id: 'heading-outline', name: 'Heading Outline', description: 'Page heading structure', category: 'qa', icon: 'List', keywords: 'headings h1 h2 outline structure seo' },
  { id: 'network-viewer', name: 'Network Viewer', description: 'Fetch and XHR activity', category: 'qa', icon: 'Network', keywords: 'network fetch xhr requests api' },
  { id: 'console-capture', name: 'Console Capture', description: 'Logs and page errors', category: 'qa', icon: 'Terminal', keywords: 'console logs errors capture' },
  { id: 'storage-viewer', name: 'Storage Viewer', description: 'Cookies, local and session storage', category: 'qa', icon: 'Database', keywords: 'storage cookie localstorage sessionstorage indexeddb' },
  { id: 'performance', name: 'Performance', description: 'Load timings and resource stats', category: 'qa', icon: 'Activity', keywords: 'performance metrics fcp lcp load timing' },
  { id: 'link-checker', name: 'Link Checker', description: 'Find broken and risky links', category: 'qa', icon: 'Link2', keywords: 'links broken checker href anchor' },
  { id: 'color-blindness', name: 'Color Blindness', description: 'Simulate vision deficiencies', category: 'qa', icon: 'Eye', keywords: 'color blindness protanopia deuteranopia simulator' },

  { id: 'annotated-screenshot', name: 'Screenshot Editor', description: 'Annotate and share captures', category: 'export', icon: 'PenLine', keywords: 'annotate screenshot editor arrow draw' },
  { id: 'element-snapshot', name: 'Element Snapshot', description: 'Copy HTML plus computed CSS', category: 'export', icon: 'FileCode2', keywords: 'element html css snapshot copy export' },
  { id: 'screen-recorder', name: 'Screen Recorder', description: 'Record a tab as WebM', category: 'export', icon: 'Video', keywords: 'record screen video webm gif capture' },
  { id: 'pdf-export', name: 'PDF Export', description: 'Print the page or selection', category: 'export', icon: 'FileDown', keywords: 'pdf print export save page' },
  { id: 'qr-code', name: 'QR Code', description: 'QR for the current URL', category: 'export', icon: 'QrCode', keywords: 'qr code url share generate' },
  { id: 'css-export', name: 'CSS Export', description: 'Export tokens in any format', category: 'export', icon: 'Share2', keywords: 'export css scss tailwind tokens variables' },

  { id: 'live-css', name: 'Live CSS Editor', description: 'Inject styles instantly', category: 'productivity', icon: 'Wand2', keywords: 'live css editor inject style playground' },
  { id: 'snippet-library', name: 'Snippet Library', description: 'Save and run code snippets', category: 'productivity', icon: 'BookOpen', keywords: 'snippets library save run code' },
  { id: 'json-viewer', name: 'JSON Viewer', description: 'Format and explore JSON', category: 'productivity', icon: 'FileJson', keywords: 'json format viewer tree pretty' },
  { id: 'regex-tester', name: 'Regex Tester', description: 'Live matching with highlights', category: 'productivity', icon: 'Search', keywords: 'regex regular expression tester match' },
  { id: 'mock-data', name: 'Mock Data', description: 'Generate fake test data', category: 'productivity', icon: 'Database', keywords: 'mock data generator fake lorem users json' },
  { id: 'placeholder-image', name: 'Placeholder Image', description: 'Quick sized image URLs', category: 'productivity', icon: 'ImagePlus', keywords: 'placeholder image generator size color' },
  { id: 'dark-mode', name: 'Dark Mode Simulator', description: 'Preview a dark theme', category: 'productivity', icon: 'Moon', keywords: 'dark mode simulator invert theme preview' },

  { id: 'breakpoint-viewer', name: 'Breakpoint Viewer', description: 'Active media queries', category: 'extras', icon: 'Layers', keywords: 'breakpoint media query responsive viewer' },
  { id: 'animation-inspector', name: 'Animation Inspector', description: 'Inspect and slow animations', category: 'extras', icon: 'Play', keywords: 'animation transition inspector slow motion' },
  { id: 'environment-switcher', name: 'Environment Switcher', description: 'Jump between dev and prod URLs', category: 'extras', icon: 'Globe2', keywords: 'environment url switcher staging localhost prod' },

  // CSS & color utilities
  { id: 'css-minifier', name: 'CSS Minifier', description: 'Shrink stylesheets', category: 'design', icon: 'Code2', keywords: 'css minify compress optimize' },
  { id: 'css-formatter', name: 'CSS Formatter', description: 'Beautify minified CSS', category: 'design', icon: 'Braces', keywords: 'css format beautify pretty' },
  { id: 'css-grid-builder', name: 'Grid Template Builder', description: 'Compose grid layouts', category: 'design', icon: 'Grid3x3', keywords: 'grid template columns rows gap builder' },
  { id: 'flexbox-playground', name: 'Flexbox Playground', description: 'Tune flex alignment live', category: 'design', icon: 'Box', keywords: 'flexbox flex justify align playground' },
  { id: 'box-shadow-generator', name: 'Box Shadow Generator', description: 'Layered shadow presets', category: 'design', icon: 'Sparkles', keywords: 'box shadow generator layered inset' },
  { id: 'border-radius-generator', name: 'Border Radius Generator', description: 'Shape corners precisely', category: 'design', icon: 'Box', keywords: 'border radius corner pill circle' },
  { id: 'clip-path-generator', name: 'Clip Path Generator', description: 'Build clip path shapes', category: 'design', icon: 'Palette', keywords: 'clip path polygon circle shape' },
  { id: 'gradient-generator', name: 'Gradient Generator', description: 'Linear, radial and conic', category: 'design', icon: 'Palette', keywords: 'gradient linear radial conic stops' },
  { id: 'color-shades', name: 'Color Shades', description: 'Tints and shades from a color', category: 'design', icon: 'Palette', keywords: 'color shades tints palette scale' },
  { id: 'color-harmony', name: 'Color Harmony', description: 'Complementary and triadic sets', category: 'design', icon: 'Palette', keywords: 'color harmony complementary triadic analogous' },
  { id: 'css-animation-generator', name: 'Animation Generator', description: 'Keyframes from presets', category: 'design', icon: 'Sparkles', keywords: 'css animation keyframes generator fade slide' },
  { id: 'font-stack-generator', name: 'Font Stack Generator', description: 'Reliable font fallbacks', category: 'design', icon: 'Type', keywords: 'font stack fallback system fonts' },
  { id: 'css-reset-snippets', name: 'CSS Reset Snippets', description: 'Copy a modern reset', category: 'design', icon: 'FileCode2', keywords: 'css reset normalize boilerplate snippet' },
  { id: 'css-comment-remover', name: 'CSS Comment Remover', description: 'Strip comments safely', category: 'design', icon: 'Code2', keywords: 'css comments remove strip license' },

  // Code & data conversion
  { id: 'html-minifier', name: 'HTML Minifier', description: 'Shrink markup', category: 'productivity', icon: 'FileCode2', keywords: 'html minify compress' },
  { id: 'html-formatter', name: 'HTML Formatter', description: 'Pretty print markup', category: 'productivity', icon: 'Code2', keywords: 'html format beautify pretty' },
  { id: 'json-to-typescript', name: 'JSON to TypeScript', description: 'Infer interfaces from JSON', category: 'productivity', icon: 'Braces', keywords: 'json typescript interface type infer' },
  { id: 'csv-to-json', name: 'CSV to JSON', description: 'Convert spreadsheet data', category: 'productivity', icon: 'Database', keywords: 'csv json convert spreadsheet' },
  { id: 'json-to-csv', name: 'JSON to CSV', description: 'Flatten arrays to CSV', category: 'productivity', icon: 'Database', keywords: 'json csv export convert' },
  { id: 'url-params', name: 'URL Parameter Editor', description: 'Edit query strings visually', category: 'productivity', icon: 'Link2', keywords: 'url query params search editor' },
  { id: 'url-encoder', name: 'URL Encoder', description: 'Encode and decode URLs', category: 'productivity', icon: 'Link2', keywords: 'url encode decode uri component' },
  { id: 'base64-tool', name: 'Base64 Tool', description: 'Encode and decode UTF-8', category: 'productivity', icon: 'Share2', keywords: 'base64 encode decode unicode' },
  { id: 'text-case', name: 'Text Case Converter', description: 'camel, snake, kebab and more', category: 'productivity', icon: 'Type', keywords: 'text case camel snake kebab pascal title' },
  { id: 'slug-generator', name: 'Slug Generator', description: 'URL-friendly names', category: 'productivity', icon: 'Search', keywords: 'slug url friendly seo name' },
  { id: 'lorem-generator', name: 'Lorem Ipsum', description: 'Fill layouts with text', category: 'productivity', icon: 'BookOpen', keywords: 'lorem ipsum placeholder text generator' },
  { id: 'html-entities', name: 'HTML Entities', description: 'Encode and decode entities', category: 'productivity', icon: 'Code2', keywords: 'html entity encode decode amp lt gt' },
  { id: 'unicode-escaper', name: 'Unicode Escaper', description: 'Escape non-ASCII characters', category: 'productivity', icon: 'Braces', keywords: 'unicode escape \\uXXXX ascii encode' },
  { id: 'text-diff', name: 'Text Diff', description: 'Compare two blocks of text', category: 'productivity', icon: 'Search', keywords: 'diff compare text lines changes' },

  // QA & validation
  { id: 'html-validator', name: 'HTML Validator', description: 'Catch common markup issues', category: 'qa', icon: 'Accessibility', keywords: 'html validate check markup tags' },
  { id: 'css-lint', name: 'CSS Linter', description: 'Quick stylesheet checks', category: 'qa', icon: 'Code2', keywords: 'css lint validate warnings' },
  { id: 'bracket-checker', name: 'Bracket Checker', description: 'Find unbalanced delimiters', category: 'qa', icon: 'Braces', keywords: 'bracket balance check braces parens' },
  { id: 'cron-parser', name: 'Cron Parser', description: 'Explain schedule expressions', category: 'qa', icon: 'Terminal', keywords: 'cron schedule expression parser' },
  { id: 'http-status', name: 'HTTP Status Codes', description: 'Searchable code reference', category: 'qa', icon: 'Network', keywords: 'http status codes 200 404 500 reference' },
  { id: 'mime-types', name: 'MIME Types', description: 'Lookup extensions and types', category: 'qa', icon: 'Database', keywords: 'mime type extension content type lookup' },
  { id: 'seo-meta', name: 'SEO Meta Analyzer', description: 'Audit a pasted head tag', category: 'qa', icon: 'Search', keywords: 'seo meta title description og analyze' },
  { id: 'a11y-checklist', name: 'A11y Checklist', description: 'Track accessibility tasks', category: 'qa', icon: 'Accessibility', keywords: 'accessibility checklist a11y wcag audit' },
  { id: 'meta-tag-generator', name: 'Meta Tag Generator', description: 'Open Graph and Twitter tags', category: 'qa', icon: 'Share2', keywords: 'meta tags og twitter card social generator' },
  { id: 'media-query-builder', name: 'Media Query Builder', description: 'Compose responsive rules', category: 'qa', icon: 'Monitor', keywords: 'media query breakpoint responsive builder' },

  // Generators & snippets
  { id: 'uuid-generator', name: 'UUID Generator', description: 'Create v4 identifiers', category: 'extras', icon: 'Sparkles', keywords: 'uuid guid v4 generate random id' },
  { id: 'react-component-generator', name: 'React Component', description: 'Scaffold a typed component', category: 'extras', icon: 'FileCode2', keywords: 'react component tsx props generator' },
  { id: 'html-boilerplate', name: 'HTML Boilerplate', description: 'Start a fresh document', category: 'extras', icon: 'FileCode2', keywords: 'html boilerplate template document starter' },
  { id: 'package-json-generator', name: 'package.json Generator', description: 'Build a manifest', category: 'extras', icon: 'FileJson', keywords: 'package json npm manifest generator dependencies' },
  { id: 'vite-config-generator', name: 'Vite Config Generator', description: 'Scaffold vite.config.ts', category: 'extras', icon: 'Wand2', keywords: 'vite config generator port alias plugins' },
  { id: 'gitignore-generator', name: '.gitignore Generator', description: 'Pick ignore presets', category: 'extras', icon: 'Layers', keywords: 'gitignore generator node react vscode env' },
  { id: 'env-template', name: 'Env Template', description: 'Document environment variables', category: 'extras', icon: 'Braces', keywords: 'env template example environment variables dotenv' },
  { id: 'tailwind-reference', name: 'Tailwind Reference', description: 'Search utility classes', category: 'extras', icon: 'Palette', keywords: 'tailwind css utility classes reference cheatsheet' },
  { id: 'design-token-generator', name: 'Design Token Generator', description: 'CSS variables and JSON tokens', category: 'extras', icon: 'Braces', keywords: 'design tokens css variables json scale generator' },
  { id: 'svg-placeholder', name: 'SVG Placeholder', description: 'Generate inline SVG placeholders', category: 'extras', icon: 'Image', keywords: 'svg placeholder image data uri generator' },
  { id: 'json-schema', name: 'JSON Schema', description: 'Infer a schema from JSON', category: 'extras', icon: 'FileJson', keywords: 'json schema infer validate generate' },
  { id: 'color-names', name: 'CSS Color Names', description: 'Search named colors', category: 'extras', icon: 'Palette', keywords: 'color names css named colors hex reference' },
  { id: 'regex-cheatsheet', name: 'Regex Cheatsheet', description: 'Tokens, groups and flags', category: 'extras', icon: 'Search', keywords: 'regex cheatsheet flags quantifiers groups reference' },
];

export const TOOL_COUNT = TOOLS.length;

/** Tools that work without clicking the inspected page. Everything else is
 * opened in the side panel so the picker does not close when focus leaves the popup. */
export const POPUP_SAFE_TOOLS = new Set([
  'color-picker',
  'screenshot',
  'contrast-checker',
  'css-generators',
  'json-viewer',
  'regex-tester',
  'mock-data',
  'placeholder-image',
  'annotated-screenshot',
  'screen-recorder',

  // New tools are all local-only, so they run directly in the popup too.
  'css-minifier', 'css-formatter', 'css-grid-builder', 'flexbox-playground',
  'box-shadow-generator', 'border-radius-generator', 'clip-path-generator', 'gradient-generator',
  'color-shades', 'color-harmony', 'css-animation-generator', 'font-stack-generator',
  'css-reset-snippets', 'css-comment-remover',
  'html-minifier', 'html-formatter', 'json-to-typescript', 'csv-to-json', 'json-to-csv',
  'url-params', 'url-encoder', 'base64-tool', 'text-case', 'slug-generator', 'lorem-generator',
  'html-entities', 'unicode-escaper', 'text-diff',
  'html-validator', 'css-lint', 'bracket-checker', 'cron-parser', 'http-status', 'mime-types',
  'seo-meta', 'a11y-checklist',
  'meta-tag-generator', 'media-query-builder',
  'uuid-generator', 'react-component-generator', 'html-boilerplate',
  'package-json-generator', 'vite-config-generator', 'gitignore-generator', 'env-template',
  'tailwind-reference', 'design-token-generator', 'svg-placeholder',
  'json-schema', 'color-names', 'regex-cheatsheet',
]);

export const FEATURED_TOOLS = ['color-picker', 'screenshot', 'font-picker', 'computed-css', 'contrast-checker'];
