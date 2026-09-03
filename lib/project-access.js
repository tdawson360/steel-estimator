// Who may view / edit an estimate. Shared by the project routes (GET/PUT and
// the edit lock) and mirrored on the client (SteelEstimator's canEdit) so the
// estimator can refuse writes the server would 403. Pure — no Prisma.

export function canViewProject(user, project) {
  if (user.role === 'ADMIN' || user.role === 'ESTIMATOR') return true;
  if ((user.role === 'PM' || user.role === 'FIELD_SHOP') && project.status === 'PUBLISHED') return true;
  return false;
}

export function canEditProject(user, project) {
  // Template projects (e.g. "Connx Template") feed company pricing via sync:
  // only admins and the template's assigned estimator may edit.
  if (project.isTemplate) {
    if (user.role === 'ADMIN') return true;
    return user.role === 'ESTIMATOR'
      && project.estimatorId != null
      && Number(project.estimatorId) === Number(user.id);
  }
  if (user.role === 'ADMIN') return true;
  if (user.role === 'ESTIMATOR' && (project.status === 'DRAFT' || project.status === 'IN_REVIEW' || project.status === 'REOPENED')) return true;
  return false;
}
