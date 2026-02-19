'use client';

import { useEffect } from 'react';

// The projects list has been replaced by /dashboard.
// This redirect ensures any bookmarked or linked /projects URLs still work.
export default function ProjectsRedirect() {
  useEffect(() => {
    window.location.replace('/dashboard');
  }, []);
  return null;
}
