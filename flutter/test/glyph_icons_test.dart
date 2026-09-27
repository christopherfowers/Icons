// Tests for the generated Glyph Icons package.
//
// Two jobs:
//   - the geometry/codepoint contract (every icon exists, is wired to its font,
//     and still carries the codepoint recorded in codepoints.json)
//   - the widget contract (an Icon built from any of them actually renders)
//
// The contract tests read the repository's source of truth rather than the
// generated Dart, so a stale or hand-edited generated file fails the suite.

import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:glyph_icons/glyph_catalog.dart';
import 'package:glyph_icons/glyph_icons.dart';

/// Walk up from the test's working directory to the repository root, which is
/// the directory holding `codepoints.json`.
Directory repositoryRoot() {
  var dir = Directory.current;
  for (var i = 0; i < 6; i++) {
    if (File('${dir.path}/codepoints.json').existsSync()) return dir;
    final parent = dir.parent;
    if (parent.path == dir.path) break;
    dir = parent;
  }
  throw StateError('could not find codepoints.json above ${Directory.current.path}');
}

void main() {
  final root = repositoryRoot();

  final codepoints = (jsonDecode(File('${root.path}/codepoints.json').readAsStringSync())
      as Map<String, dynamic>)['icons'] as Map<String, dynamic>;

  final everyIcon = <String, IconData>{
    for (final group in glyphCatalog.values) ...group,
  };

  group('catalog', () {
    test('covers every source SVG, and nothing else', () {
      final onDisk = <String>{};
      for (final dir in Directory('${root.path}/svg').listSync().whereType<Directory>()) {
        final groupName = dir.path.split(Platform.pathSeparator).last;
        expect(
          glyphCatalog.keys,
          contains(groupName),
          reason: 'group "$groupName" exists under svg/ but has no generated library',
        );
        for (final file in dir.listSync().whereType<File>()) {
          if (!file.path.endsWith('.svg')) continue;
          final name = file.uri.pathSegments.last.replaceAll('.svg', '');
          onDisk.add(name);
          expect(
            glyphCatalog[groupName],
            contains(name),
            reason: 'svg/$groupName/$name.svg has no generated IconData',
          );
        }
      }
      expect(everyIcon.keys.toSet(), onDisk,
          reason: 'run `npm run build` and commit the regenerated Dart');
    });

    test('is not empty', () {
      expect(everyIcon, isNotEmpty);
      expect(glyphCatalog.keys, isNotEmpty);
    });

    test('gives every icon a unique codepoint', () {
      final byCodepoint = <int, String>{};
      everyIcon.forEach((name, icon) {
        final clash = byCodepoint[icon.codePoint];
        expect(clash, isNull, reason: '"$name" and "$clash" share U+${icon.codePoint.toRadixString(16)}');
        byCodepoint[icon.codePoint] = name;
      });
    });
  });

  group('codepoints.json', () {
    test('matches the generated IconData exactly', () {
      everyIcon.forEach((name, icon) {
        expect(codepoints, contains(name), reason: '"$name" is missing from codepoints.json');
        expect(
          icon.codePoint,
          int.parse(codepoints[name]! as String, radix: 16),
          reason: '"$name" was renumbered - codepoints are permanent, never reassign one',
        );
      });
    });

    test('has an entry for every generated icon', () {
      for (final name in codepoints.keys) {
        expect(everyIcon, contains(name), reason: '"$name" is in codepoints.json but has no icon');
      }
    });
  });

  group('font wiring', () {
    test('every icon points at its group font, shipped from this package', () {
      glyphCatalog.forEach((groupName, icons) {
        icons.forEach((name, icon) {
          expect(icon.fontPackage, 'glyph_icons', reason: '"$name" has the wrong fontPackage');
          expect(icon.fontFamily, isNotNull, reason: '"$name" has no fontFamily');
          expect(
            icon.fontFamily,
            startsWith('Glyph'),
            reason: '"$name" is not wired to a Glyph font family',
          );
        });
      });
    });

    test('each group has exactly one font family, and the asset exists', () {
      glyphCatalog.forEach((groupName, icons) {
        final families = icons.values.map((icon) => icon.fontFamily).toSet();
        expect(families, hasLength(1), reason: 'group "$groupName" spans several font families');
        final file = File('${root.path}/flutter/fonts/${families.single}.ttf');
        expect(file.existsSync(), isTrue, reason: 'missing font asset ${file.path}');
        expect(file.lengthSync(), greaterThan(0));
      });
    });
  });

  group('widgets', () {
    testWidgets('every icon renders without error', (tester) async {
      await tester.pumpWidget(
        Directionality(
          textDirection: TextDirection.ltr,
          child: Wrap(
            children: [
              for (final icon in everyIcon.values) Icon(icon, size: 16),
            ],
          ),
        ),
      );

      expect(tester.takeException(), isNull);
      expect(find.byType(Icon), findsNWidgets(everyIcon.length));
    });

    testWidgets('an icon can be found by its IconData', (tester) async {
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: Icon(GlyphCore.home, size: 48),
        ),
      );

      expect(find.byIcon(GlyphCore.home), findsOneWidget);
      final rendered = tester.widget<Icon>(find.byType(Icon));
      expect(rendered.icon, GlyphCore.home);
      expect(tester.getSize(find.byType(Icon)), const Size(48, 48));
    });

    testWidgets('icons inherit the ambient colour', (tester) async {
      await tester.pumpWidget(
        const Directionality(
          textDirection: TextDirection.ltr,
          child: IconTheme(
            data: IconThemeData(color: Color(0xFF00FF00), size: 32),
            child: Icon(GlyphStatus.warning),
          ),
        ),
      );

      final richText = tester.widget<RichText>(find.byType(RichText).first);
      expect(richText.text.style?.color, const Color(0xFF00FF00));
      expect(richText.text.style?.fontSize, 32);
      // Flutter rewrites a package-scoped family to "packages/<pkg>/<family>".
      expect(richText.text.style?.fontFamily, contains(GlyphStatus.fontFamily));
    });
  });
}
