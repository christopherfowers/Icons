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

import 'glyph_actions.dart';
import 'glyph_core.dart';
import 'glyph_data.dart';
import 'glyph_editing.dart';
import 'glyph_fitting.dart';
import 'glyph_navigation.dart';
import 'glyph_ops.dart';
import 'glyph_ships.dart';
import 'glyph_space.dart';
import 'glyph_status.dart';
import 'glyph_toggles.dart';

/// Every icon in the `actions` group, keyed by its source name.
const Map<String, IconData> glyphActionsCatalog = <String, IconData>{
  'download': GlyphActions.download,
  'refresh': GlyphActions.refresh,
  'share': GlyphActions.share,
  'upload': GlyphActions.upload,
};

/// Every icon in the `core` group, keyed by its source name.
const Map<String, IconData> glyphCoreCatalog = <String, IconData>{
  'close': GlyphCore.close,
  'home': GlyphCore.home,
  'menu': GlyphCore.menu,
  'search': GlyphCore.search,
  'settings': GlyphCore.settings,
  'user': GlyphCore.user,
  'users': GlyphCore.users,
};

/// Every icon in the `data` group, keyed by its source name.
const Map<String, IconData> glyphDataCatalog = <String, IconData>{
  'calendar': GlyphData.calendar,
  'clock': GlyphData.clock,
  'filter': GlyphData.filter,
  'sort': GlyphData.sort,
};

/// Every icon in the `editing` group, keyed by its source name.
const Map<String, IconData> glyphEditingCatalog = <String, IconData>{
  'add': GlyphEditing.add,
  'check': GlyphEditing.check,
  'copy': GlyphEditing.copy,
  'delete': GlyphEditing.delete,
  'edit': GlyphEditing.edit,
  'remove': GlyphEditing.remove,
};

/// Every icon in the `fitting` group, keyed by its source name.
const Map<String, IconData> glyphFittingCatalog = <String, IconData>{
  'afterburner': GlyphFitting.afterburner,
  'armor': GlyphFitting.armor,
  'capacitor': GlyphFitting.capacitor,
  'drone': GlyphFitting.drone,
  'launcher': GlyphFitting.launcher,
  'shield': GlyphFitting.shield,
  'turret': GlyphFitting.turret,
};

/// Every icon in the `navigation` group, keyed by its source name.
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

/// Every icon in the `ops` group, keyed by its source name.
const Map<String, IconData> glyphOpsCatalog = <String, IconData>{
  'blueprint': GlyphOps.blueprint,
  'cargo': GlyphOps.cargo,
  'fleet': GlyphOps.fleet,
  'market': GlyphOps.market,
  'probe': GlyphOps.probe,
  'target-lock': GlyphOps.targetLock,
};

/// Every icon in the `ships` group, keyed by its source name.
const Map<String, IconData> glyphShipsCatalog = <String, IconData>{
  'battleship': GlyphShips.battleship,
  'cruiser': GlyphShips.cruiser,
  'frigate': GlyphShips.frigate,
  'industrial': GlyphShips.industrial,
  'shuttle': GlyphShips.shuttle,
};

/// Every icon in the `space` group, keyed by its source name.
const Map<String, IconData> glyphSpaceCatalog = <String, IconData>{
  'dock': GlyphSpace.dock,
  'jump-gate': GlyphSpace.jumpGate,
  'star-map': GlyphSpace.starMap,
  'station': GlyphSpace.station,
  'undock': GlyphSpace.undock,
  'warp': GlyphSpace.warp,
  'wormhole': GlyphSpace.wormhole,
};

/// Every icon in the `status` group, keyed by its source name.
const Map<String, IconData> glyphStatusCatalog = <String, IconData>{
  'bell': GlyphStatus.bell,
  'error': GlyphStatus.error,
  'info': GlyphStatus.info,
  'warning': GlyphStatus.warning,
};

/// Every icon in the `toggles` group, keyed by its source name.
const Map<String, IconData> glyphTogglesCatalog = <String, IconData>{
  'eye': GlyphToggles.eye,
  'eye-off': GlyphToggles.eyeOff,
  'heart': GlyphToggles.heart,
  'lock': GlyphToggles.lock,
  'star': GlyphToggles.star,
  'unlock': GlyphToggles.unlock,
};

/// Every group, keyed by group name, in the order the groups are laid out
/// under `svg/`.
const Map<String, Map<String, IconData>> glyphCatalog = <String, Map<String, IconData>>{
  'actions': glyphActionsCatalog,
  'core': glyphCoreCatalog,
  'data': glyphDataCatalog,
  'editing': glyphEditingCatalog,
  'fitting': glyphFittingCatalog,
  'navigation': glyphNavigationCatalog,
  'ops': glyphOpsCatalog,
  'ships': glyphShipsCatalog,
  'space': glyphSpaceCatalog,
  'status': glyphStatusCatalog,
  'toggles': glyphTogglesCatalog,
};
