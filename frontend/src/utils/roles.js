// Role helpers — admin is a superset of coach permissions, so any check
// that currently asks "is the user a coach?" should typically include admin.
// Use these helpers instead of comparing `user.role` strings directly.

export const isAdmin = (user) => user?.role === 'admin';
export const isCoachLike = (user) => user?.role === 'coach' || user?.role === 'admin';
export const isAthlete = (user) => user?.role === 'athlete';
