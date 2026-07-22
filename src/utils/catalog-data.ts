// Full category tree for the Andpatelec catalog
// Structure: category → subcategory → ... → final items (string[])

export const CATALOG_TREE: Record<string, any> = {
  'Canalizaciones': {
    'UCT': ['3/4', '100', '110', '112', '200'],
    'UMT': ['3/4', '100', '110', '112', '200'],
    'URT': ['3/4', '100', '110', '112', '200'],
    'GS': ['3/4', '100', '110', '112', '200'],
    'FT': ['3/4', '100', '110', '112', '200'],
  },
  'Protecciones': {
    'Diyuntores': {
      'Bifasicos': ['10', '16', '25', '32', '40'],
      'Trifasicos': ['10', '16', '25', '32', '40'],
    },
    'Termicas': {
      'Bifasicos': ['10', '16', '25', '32', '40'],
      'Trifasicos': ['10', '16', '25', '32', '40'],
    },
    'Contactores': {
      'Bifasicos': ['10', '16', '25', '32', '40'],
      'Trifasicos': ['10', '16', '25', '32', '40'],
    },
  },
  'Llaves de luz': {
    'Tapas': [
      '4 modulos',
      '3 modulos',
      '2 modulos',
      '1 modulo',
      'Tapa ciega',
      'Tapa mignon',
      'Tapa suplementaria',
      'Bastidores',
    ],
    'Pulsadores': ['De punto', 'Combinado', 'Pulsador'],
    'Bastidores': ['Tecla', 'Caja mignon'],
    'Tomas': {
      'Simples': ['20 amp', '10 amp'],
      'Dobles': ['20 amp', '10 amp'],
    },
  },
  'Cables': {
    'Unipolar': {
      '1mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '1,5mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '2,5mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '4mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '6mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '10mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
      '16mm': ['Rojo', 'Celeste', 'Marron', 'Negro', 'Tierra', 'Blanco'],
    },
    'Bipolar': ['3x2,5', '3x4', '3x6', '5x2,5', '5x4', '5x6'],
  },
  'Iluminacion': {
    'Plafones': ['17', '22x22', '10x10', '20x20', '40x40'],
    'Tubos': {},
    'Focos': ['Dicroicas', 'De embutir'],
  },
  'Varios': {},
};

// Icons for top-level categories
export const CATEGORY_ICONS: Record<string, string> = {
  'Canalizaciones': '🔧',
  'Protecciones': '🛡️',
  'Llaves de luz': '💡',
  'Cables': '🔌',
  'Iluminacion': '✨',
  'Varios': '📦',
};
