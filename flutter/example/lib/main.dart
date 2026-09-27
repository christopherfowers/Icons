// Example app for Glyph Icons: every icon in the set, grouped, searchable.
//
// It imports `glyph_catalog.dart` so it can enumerate the whole set at runtime.
// A real app should import the individual group libraries instead - see the
// README - so that Flutter's release-mode icon tree-shaker can drop the glyphs
// the app never uses.

import 'package:flutter/material.dart';
import 'package:glyph_icons/glyph_catalog.dart';
import 'package:glyph_icons/glyph_icons.dart';

void main() => runApp(const GlyphGalleryApp());

class GlyphGalleryApp extends StatelessWidget {
  const GlyphGalleryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Glyph Icons',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: const Color(0xFF2563EB), useMaterial3: true),
      darkTheme: ThemeData(
        colorSchemeSeed: const Color(0xFF2563EB),
        brightness: Brightness.dark,
        useMaterial3: true,
      ),
      home: const GalleryPage(),
    );
  }
}

class GalleryPage extends StatefulWidget {
  const GalleryPage({super.key});

  @override
  State<GalleryPage> createState() => _GalleryPageState();
}

class _GalleryPageState extends State<GalleryPage> {
  static const List<double> _sizes = <double>[16, 24, 32, 48];

  String _query = '';
  double _size = 32;

  /// The catalog, filtered by the search box and with empty groups dropped.
  Map<String, Map<String, IconData>> get _visible {
    final query = _query.trim().toLowerCase();
    final result = <String, Map<String, IconData>>{};
    glyphCatalog.forEach((group, icons) {
      final matches = <String, IconData>{
        for (final entry in icons.entries)
          if (query.isEmpty || entry.key.contains(query) || group.contains(query))
            entry.key: entry.value,
      };
      if (matches.isNotEmpty) result[group] = matches;
    });
    return result;
  }

  void _showDetails(String group, String name, IconData icon) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(icon, size: 64),
            const SizedBox(height: 16),
            Text(name, style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 4),
            Text(
              'group "$group"  ·  U+${icon.codePoint.toRadixString(16).toUpperCase()}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            SelectableText(
              "import 'package:glyph_icons/glyph_$group.dart';",
              style: const TextStyle(fontFamily: 'monospace'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visible;
    final total = visible.values.fold<int>(0, (sum, icons) => sum + icons.length);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Glyph Icons'),
        actions: <Widget>[
          PopupMenuButton<double>(
            icon: const Icon(GlyphCore.settings),
            tooltip: 'Icon size',
            initialValue: _size,
            onSelected: (size) => setState(() => _size = size),
            itemBuilder: (context) => <PopupMenuEntry<double>>[
              for (final size in _sizes)
                PopupMenuItem<double>(value: size, child: Text('${size.toInt()} px')),
            ],
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(64),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              onChanged: (value) => setState(() => _query = value),
              decoration: const InputDecoration(
                prefixIcon: Icon(GlyphCore.search),
                hintText: 'Search icons',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ),
        ),
      ),
      body: total == 0
          ? const Center(child: Text('No icons match that search.'))
          : ListView(
              padding: const EdgeInsets.only(bottom: 32),
              children: <Widget>[
                for (final entry in visible.entries)
                  _GroupSection(
                    group: entry.key,
                    icons: entry.value,
                    size: _size,
                    onTap: _showDetails,
                  ),
              ],
            ),
    );
  }
}

class _GroupSection extends StatelessWidget {
  const _GroupSection({
    required this.group,
    required this.icons,
    required this.size,
    required this.onTap,
  });

  final String group;
  final Map<String, IconData> icons;
  final double size;
  final void Function(String group, String name, IconData icon) onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: Text(
            '${group.toUpperCase()}  ·  ${icons.length}',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(letterSpacing: 1.1),
          ),
        ),
        GridView.extent(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 12),
          maxCrossAxisExtent: 128,
          childAspectRatio: 1,
          children: <Widget>[
            for (final entry in icons.entries)
              InkWell(
                onTap: () => onTap(group, entry.key, entry.value),
                borderRadius: BorderRadius.circular(10),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: <Widget>[
                    Icon(entry.value, size: size),
                    const SizedBox(height: 10),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Text(
                        entry.key,
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }
}
