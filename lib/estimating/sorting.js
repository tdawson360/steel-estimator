// Material sort presets for the per-item "Sort by…" control.

// Material sort presets for the per-item "Sort" control. Keys compare in
// order; ties break longest-length-first (how cut lists read).
const MATERIAL_SORT_PRESETS = {
  'category-size':             { label: 'Category → Size',               keys: ['category', 'size'] },
  'size':                      { label: 'Size',                          keys: ['size'] },
  'description':               { label: 'Description',                   keys: ['description'] },
  'description-size':          { label: 'Description → Size',            keys: ['description', 'size'] },
  'category-size-description': { label: 'Category → Size → Description', keys: ['category', 'size', 'description'] },
};

export { MATERIAL_SORT_PRESETS };
