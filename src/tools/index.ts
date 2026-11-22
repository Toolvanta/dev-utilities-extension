import type { ComponentType } from 'react';
import { ColorPickerTool, FontPickerTool, ScreenshotTool } from './core';
import {
  BoxModelTool, ComputedCssTool, ContrastCheckerTool, CssGeneratorsTool, CssVariablesTool,
  GridOverlayTool, PaletteExtractorTool, RulerTool, SelectorCopierTool,
} from './design';
import {
  AccessibilityAuditTool, ColorBlindnessTool, ConsoleCaptureTool, HeadingOutlineTool,
  ImageInspectorTool, LinkCheckerTool, NetworkViewerTool, PerformanceTool,
  StorageViewerTool, ViewportEmulatorTool,
} from './qa';
import {
  AnnotatedScreenshotTool, CssExportTool, ElementSnapshotTool, PdfExportTool,
  QrCodeTool, ScreenRecorderTool,
} from './export';
import {
  DarkModeTool, JsonViewerTool, LiveCssEditorTool, MockDataTool, PlaceholderImageTool,
  RegexTesterTool, SnippetLibraryTool,
} from './productivity';
import { AnimationInspectorTool, BreakpointViewerTool, EnvironmentSwitcherTool } from './extras';
import {
  BorderRadiusTool, BoxShadowTool, ClipPathTool, ColorHarmonyTool, ColorShadesTool,
  CssAnimationTool, CssCommentRemoverTool, CssFormatterTool, CssGridBuilderTool,
  CssMinifierTool, CssResetTool, FlexboxPlaygroundTool,
  FontStackTool, GradientTool,
} from './more-css';
import {
  Base64Tool, CsvToJsonTool, HtmlEntitiesTool, HtmlFormatterTool, HtmlMinifierTool,
  JsonToCsvTool, JsonToTypescriptTool, LoremGeneratorTool, SlugGeneratorTool,
  TextCaseTool, TextDiffTool, UnicodeEscaperTool, UrlEncoderTool, UrlParamsTool,
} from './more-data';
import {
  A11yChecklistTool, BracketCheckerTool, CronParserTool,
  CssLintTool, HtmlValidatorTool, HttpStatusTool,
  MediaQueryBuilderTool, MetaTagGeneratorTool, MimeTypesTool, SeoMetaTool,
} from './more-qa';
import {
  ColorNamesTool, DesignTokenGeneratorTool, EnvTemplateTool, GitignoreGeneratorTool,
  HtmlBoilerplateTool, JsonSchemaTool, RegexCheatsheetTool, ReactComponentGeneratorTool,
  SvgPlaceholderTool, TailwindReferenceTool, UuidGeneratorTool,
  ViteConfigGeneratorTool, PackageJsonGeneratorTool,
} from './more-generators';

export const TOOL_COMPONENTS: Record<string, ComponentType> = {
  'color-picker': ColorPickerTool,
  'font-picker': FontPickerTool,
  screenshot: ScreenshotTool,

  'computed-css': ComputedCssTool,
  'selector-copier': SelectorCopierTool,
  'box-model': BoxModelTool,
  'grid-overlay': GridOverlayTool,
  ruler: RulerTool,
  'palette-extractor': PaletteExtractorTool,
  'contrast-checker': ContrastCheckerTool,
  'css-generators': CssGeneratorsTool,
  'css-variables': CssVariablesTool,

  'viewport-emulator': ViewportEmulatorTool,
  'image-inspector': ImageInspectorTool,
  'accessibility-audit': AccessibilityAuditTool,
  'heading-outline': HeadingOutlineTool,
  'network-viewer': NetworkViewerTool,
  'console-capture': ConsoleCaptureTool,
  'storage-viewer': StorageViewerTool,
  performance: PerformanceTool,
  'link-checker': LinkCheckerTool,
  'color-blindness': ColorBlindnessTool,

  'annotated-screenshot': AnnotatedScreenshotTool,
  'element-snapshot': ElementSnapshotTool,
  'screen-recorder': ScreenRecorderTool,
  'pdf-export': PdfExportTool,
  'qr-code': QrCodeTool,
  'css-export': CssExportTool,

  'live-css': LiveCssEditorTool,
  'snippet-library': SnippetLibraryTool,
  'json-viewer': JsonViewerTool,
  'regex-tester': RegexTesterTool,
  'mock-data': MockDataTool,
  'placeholder-image': PlaceholderImageTool,
  'dark-mode': DarkModeTool,

  'breakpoint-viewer': BreakpointViewerTool,
  'animation-inspector': AnimationInspectorTool,
  'environment-switcher': EnvironmentSwitcherTool,

  // CSS & color utilities
  'css-minifier': CssMinifierTool,
  'css-formatter': CssFormatterTool,
  'css-grid-builder': CssGridBuilderTool,
  'flexbox-playground': FlexboxPlaygroundTool,
  'box-shadow-generator': BoxShadowTool,
  'border-radius-generator': BorderRadiusTool,
  'clip-path-generator': ClipPathTool,
  'gradient-generator': GradientTool,
  'color-shades': ColorShadesTool,
  'color-harmony': ColorHarmonyTool,
  'css-animation-generator': CssAnimationTool,
  'font-stack-generator': FontStackTool,
  'css-reset-snippets': CssResetTool,
  'css-comment-remover': CssCommentRemoverTool,

  // Code & data conversion
  'html-minifier': HtmlMinifierTool,
  'html-formatter': HtmlFormatterTool,
  'json-to-typescript': JsonToTypescriptTool,
  'csv-to-json': CsvToJsonTool,
  'json-to-csv': JsonToCsvTool,
  'url-params': UrlParamsTool,
  'url-encoder': UrlEncoderTool,
  'base64-tool': Base64Tool,
  'text-case': TextCaseTool,
  'slug-generator': SlugGeneratorTool,
  'lorem-generator': LoremGeneratorTool,
  'html-entities': HtmlEntitiesTool,
  'unicode-escaper': UnicodeEscaperTool,
  'text-diff': TextDiffTool,

  // QA & validation
  'html-validator': HtmlValidatorTool,
  'css-lint': CssLintTool,
  'bracket-checker': BracketCheckerTool,
  'cron-parser': CronParserTool,
  'http-status': HttpStatusTool,
  'mime-types': MimeTypesTool,
  'seo-meta': SeoMetaTool,
  'a11y-checklist': A11yChecklistTool,
  'meta-tag-generator': MetaTagGeneratorTool,
  'media-query-builder': MediaQueryBuilderTool,

  // Generators & snippets
  'uuid-generator': UuidGeneratorTool,
  'react-component-generator': ReactComponentGeneratorTool,
  'html-boilerplate': HtmlBoilerplateTool,
  'package-json-generator': PackageJsonGeneratorTool,
  'vite-config-generator': ViteConfigGeneratorTool,
  'gitignore-generator': GitignoreGeneratorTool,
  'env-template': EnvTemplateTool,
  'tailwind-reference': TailwindReferenceTool,
  'design-token-generator': DesignTokenGeneratorTool,
  'svg-placeholder': SvgPlaceholderTool,
  'json-schema': JsonSchemaTool,
  'color-names': ColorNamesTool,
  'regex-cheatsheet': RegexCheatsheetTool,
};
