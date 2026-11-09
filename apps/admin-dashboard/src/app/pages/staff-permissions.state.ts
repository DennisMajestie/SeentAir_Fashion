export interface PermissionLevelOption {
  value: string;
  label: string;
}

export interface RolePermissionValue {
  module: string;
  accessLevel: string;
}

export interface RolePermissionsSnapshot {
  id: string;
  name: string;
  permissions: RolePermissionValue[];
  accessLevels: string[];
  version: string;
  memberCount: number;
}

export interface PermissionChange {
  module: string;
  before: string;
  after: string;
}

export function draftForRole(
  role: RolePermissionsSnapshot,
  modules: readonly string[],
): Record<string, string> {
  const saved = new Map(role.permissions.map((permission) => [permission.module, permission.accessLevel]));
  return Object.fromEntries(modules.map((module) => [module, saved.get(module) ?? 'none']));
}

export function permissionChanges(
  role: RolePermissionsSnapshot,
  draft: Readonly<Record<string, string>>,
  modules: readonly string[],
): PermissionChange[] {
  const saved = new Map(role.permissions.map((permission) => [permission.module, permission.accessLevel]));
  return modules.flatMap((module) => {
    const before = saved.get(module) ?? 'none';
    const after = draft[module] ?? 'none';
    return before === after ? [] : [{ module, before, after }];
  });
}

export function permissionSet(
  draft: Readonly<Record<string, string>>,
  modules: readonly string[],
): RolePermissionValue[] {
  return modules.map((module) => ({ module, accessLevel: draft[module] ?? 'none' }));
}

export function roleHasChanges(
  role: RolePermissionsSnapshot,
  draft: Readonly<Record<string, string>> | undefined,
  modules: readonly string[],
): boolean {
  return !!draft && permissionChanges(role, draft, modules).length > 0;
}
