// GENERATED FILE - DO NOT EDIT.
//
// Regenerate with `npm run build` from the repository root.

/// Name-keyed lookup tables for Glyph Icons.
///
/// **Do not import this from production code.** Referencing a catalog marks
/// every icon in it as used, which defeats Flutter's icon tree-shaking and
/// ships the full font. It exists for galleries, documentation and tests.
library;

import 'package:flutter/widgets.dart';

import 'glyph_core_filled.dart';
import 'glyph_status_filled.dart';
import 'glyph_toggles_filled.dart';
import 'glyph_actions.dart';
import 'glyph_core.dart';
import 'glyph_data.dart';
import 'glyph_editing.dart';
import 'glyph_navigation.dart';
import 'glyph_status.dart';
import 'glyph_toggles.dart';

/// Every icon in the `core` group (`filled`), keyed by source name.
const Map<String, IconData> glyphCoreFilledCatalog = <String, IconData>{
  'home': GlyphCoreFilled.home,
  'search': GlyphCoreFilled.search,
  'settings': GlyphCoreFilled.settings,
  'user': GlyphCoreFilled.user,
  'users': GlyphCoreFilled.users,
};

/// Every icon in the `status` group (`filled`), keyed by source name.
const Map<String, IconData> glyphStatusFilledCatalog = <String, IconData>{
  'bell': GlyphStatusFilled.bell,
  'error': GlyphStatusFilled.error,
  'info': GlyphStatusFilled.info,
  'warning': GlyphStatusFilled.warning,
};

/// Every icon in the `toggles` group (`filled`), keyed by source name.
const Map<String, IconData> glyphTogglesFilledCatalog = <String, IconData>{
  'eye': GlyphTogglesFilled.eye,
  'heart': GlyphTogglesFilled.heart,
  'lock': GlyphTogglesFilled.lock,
  'star': GlyphTogglesFilled.star,
  'unlock': GlyphTogglesFilled.unlock,
};

/// Every icon in the `actions` group (`outline`), keyed by source name.
const Map<String, IconData> glyphActionsCatalog = <String, IconData>{
  'download': GlyphActions.download,
  'refresh': GlyphActions.refresh,
  'share': GlyphActions.share,
  'upload': GlyphActions.upload,
};

/// Every icon in the `core` group (`outline`), keyed by source name.
const Map<String, IconData> glyphCoreCatalog = <String, IconData>{
  'close': GlyphCore.close,
  'home': GlyphCore.home,
  'menu': GlyphCore.menu,
  'search': GlyphCore.search,
  'settings': GlyphCore.settings,
  'user': GlyphCore.user,
  'users': GlyphCore.users,
};

/// Every icon in the `data` group (`outline`), keyed by source name.
const Map<String, IconData> glyphDataCatalog = <String, IconData>{
  'calendar': GlyphData.calendar,
  'clock': GlyphData.clock,
  'filter': GlyphData.filter,
  'sort': GlyphData.sort,
};

/// Every icon in the `editing` group (`outline`), keyed by source name.
const Map<String, IconData> glyphEditingCatalog = <String, IconData>{
  'add': GlyphEditing.add,
  'check': GlyphEditing.check,
  'copy': GlyphEditing.copy,
  'delete': GlyphEditing.delete,
  'edit': GlyphEditing.edit,
  'remove': GlyphEditing.remove,
};

/// Every icon in the `navigation` group (`outline`), keyed by source name.
const Map<String, IconData> glyphNavigationCatalog = <String, IconData>{
  'arrow-left': GlyphNavigation.arrowLeft,
  'arrow-right': GlyphNavigation.arrowRight,
  'chevron-down': GlyphNavigation.chevronDown,
  'chevron-left': GlyphNavigation.chevronLeft,
  'chevron-right': GlyphNavigation.chevronRight,
  'chevron-up': GlyphNavigation.chevronUp,
  'external-link': GlyphNavigation.externalLink,
  'link': GlyphNavigation.link,
};

/// Every icon in the `status` group (`outline`), keyed by source name.
const Map<String, IconData> glyphStatusCatalog = <String, IconData>{
  'bell': GlyphStatus.bell,
  'error': GlyphStatus.error,
  'info': GlyphStatus.info,
  'warning': GlyphStatus.warning,
};

/// Every icon in the `toggles` group (`outline`), keyed by source name.
const Map<String, IconData> glyphTogglesCatalog = <String, IconData>{
  'eye': GlyphToggles.eye,
  'eye-off': GlyphToggles.eyeOff,
  'heart': GlyphToggles.heart,
  'lock': GlyphToggles.lock,
  'star': GlyphToggles.star,
  'unlock': GlyphToggles.unlock,
};

/// The `filled` variant, keyed by group name.
const Map<String, Map<String, IconData>> glyphFilledCatalog = <String, Map<String, IconData>>{
  'core': glyphCoreFilledCatalog,
  'status': glyphStatusFilledCatalog,
  'toggles': glyphTogglesFilledCatalog,
};

/// The `outline` variant, keyed by group name.
const Map<String, Map<String, IconData>> glyphOutlineCatalog = <String, Map<String, IconData>>{
  'actions': glyphActionsCatalog,
  'core': glyphCoreCatalog,
  'data': glyphDataCatalog,
  'editing': glyphEditingCatalog,
  'navigation': glyphNavigationCatalog,
  'status': glyphStatusCatalog,
  'toggles': glyphTogglesCatalog,
};

/// Every variant, keyed by variant name then group name.
const Map<String, Map<String, Map<String, IconData>>> glyphCatalog =
    <String, Map<String, Map<String, IconData>>>{
  'filled': glyphFilledCatalog,
  'outline': glyphOutlineCatalog,
};
