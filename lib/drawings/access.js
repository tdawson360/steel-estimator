// Who may do what with drawing sets.
//   upload / run jobs / pass / chase : ADMIN, ESTIMATOR
//   view a set                        : ADMIN, ESTIMATOR always; PM, FIELD_SHOP only
//                                       when it belongs to a PUBLISHED project
export function canManageDrawings(user) {
  return !!user && (user.role === 'ADMIN' || user.role === 'ESTIMATOR');
}

export function canViewDrawingSet(user, set) {
  if (!user) return false;
  if (canManageDrawings(user)) return true;
  return !!(set?.project && set.project.status === 'PUBLISHED');
}
