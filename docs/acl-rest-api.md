# Role-Based Access Control - REST API

[Back to RBAC Overview](./rbac.md)

Overview:
 - [Directory ACL Operations: /acl/directory](#directory-acl-operations-acldirectory)
   - [Get Directory ACL](#get-directory-acl)
   - [Set Directory Public Flag](#set-directory-public-flag)
   - [Grant a Directory Permission](#grant-a-directory-permission)
   - [Revoke a Directory Permission](#revoke-a-directory-permission)
   - [Remove a Directory's ACL](#remove-a-directorys-acl)
 - [Identity](#identity)
   - [Who Am I](#who-am-i)
 - [Role Operations: /acl/roles](#role-operations-aclroles)
   - [List Roles](#list-roles)
   - [Create a Role](#create-a-role)
   - [Remove a Role](#remove-a-role)
   - [List Users in a Role](#list-users-in-a-role)
 - [User Operations: /acl/users](#user-operations-aclusers)
   - [List Users](#list-users)
   - [Create a User](#create-a-user)
   - [Remove a User](#remove-a-user)
   - [List a User's Roles](#list-a-users-roles)
   - [Assign a Role to a User](#assign-a-role-to-a-user)
   - [Remove a Role from a User](#remove-a-role-from-a-user)
 - [Test a Permission](#test-a-permission)

All endpoints require `Authorization: Bearer <token>` like the rest of the REST API (see
[HTTP REST API](../README.md#http-rest-api)). Two distinct authorization models apply:

- **Directory ACL operations** require the `admin` permission on that specific directory (a
  role granted `admin` there, or the global `admin` role) - see
  [Directory ACL](./rbac.md#directory-acl).
- **Role/user operations and the permission test** are system-wide, not scoped to any
  directory, so they require the global `admin` role, with one exception:
  `GET /acl/users/{user}/roles` also allows a caller to look up **their own** roles without
  being an admin (used by `cask whoami`).
- **`GET /acl/whoami`** requires no permission at all - it only ever reports the caller's own
  identity.

# Directory ACL Operations: /acl/directory

## Get Directory ACL
- GET /acl/directory/{path+}

   - Description: Get the ACL for a directory, including its public flag and permissions.
   - Parameters:
     - path (string, required): The directory path.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
   - Responses:
     - 200 OK: `{ directory, directory_id, root_acl_directory_id, root_acl_directory, root_directory_acl_id, public, permissions: [{permission, principalType, principalName}] }` - `principalType` is `"role"` or `"user"` (see [Principals](./rbac.md#principals)).
     - 403 Forbidden: The requestor lacks `admin` permission on this directory.
     - 404 Not Found: The directory does not exist.

## Set Directory Public Flag
- PUT /acl/directory/{path+}/public

   - Description: Set or clear the public-read flag for a directory. Creates the directory's root ACL if it doesn't already have one.
   - Parameters:
     - path (string, required): The directory path.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
     - Content-Type: application/json
   - Body: `{ "public": true | false }`
   - Responses:
     - 200 OK: `{ directory, public }`
     - 403 Forbidden: The requestor lacks `admin` permission on this directory.

## Grant a Directory Permission
- POST /acl/directory/{path+}/permissions

   - Description: Grant a principal (a role or a user) a permission on a directory. Creates the principal and/or the directory's root ACL if they don't already exist. Child directories inherit this permission unless explicitly overridden.
   - Parameters:
     - path (string, required): The directory path.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
     - Content-Type: application/json
   - Body: `{ "principal": string, "principalType": "role" | "user", "permission": "read" | "write" | "admin" }` - `principalType` defaults to `"role"` if omitted.
   - Responses:
     - 200 OK: `{ directory, principal, principalType, permission }`
     - 400 Bad Request: Missing/invalid principal or permission.
     - 403 Forbidden: The requestor lacks `admin` permission on this directory.

## Revoke a Directory Permission
- DELETE /acl/directory/{path+}/permissions

   - Description: Revoke a principal's (a role's or a user's) permission on a directory.
   - Parameters:
     - path (string, required): The directory path.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
     - Content-Type: application/json
   - Body: `{ "principal": string, "principalType": "role" | "user", "permission": "read" | "write" | "admin" }` - `principalType` defaults to `"role"` if omitted.
   - Responses:
     - 200 OK: `{ directory, principal, principalType, permission }`
     - 403 Forbidden: The requestor lacks `admin` permission on this directory.

## Remove a Directory's ACL
- DELETE /acl/directory/{path+}

   - Description: Remove a directory's own ACL entirely. It (and any children without their own explicit ACL) will inherit from the nearest ancestor directory that has one.
   - Parameters:
     - path (string, required): The directory path.
   - Headers:
     - Authorization (string, required): Bearer token for authentication.
   - Responses:
     - 200 OK: `{ directory }`
     - 403 Forbidden: The requestor lacks `admin` permission on this directory.

# Identity

## Who Am I
- GET /acl/whoami

   - Description: Report the caller's own identity - username, roles, and whether they hold
     the global admin role. No permission required; an unauthenticated caller gets a null
     identity rather than an error. `isAdmin` is computed the same way real ACL enforcement
     decides it, so it always matches what the caller can actually do.
   - Responses:
     - 200 OK: `{ username: string|null, roles: string[], isAdmin: boolean }`

# Role Operations: /acl/roles

## List Roles
- GET /acl/roles

   - Description: List all defined roles. Global admin only.
   - Responses:
     - 200 OK: `[{ roleId, role, created }]`
     - 403 Forbidden: The requestor is not a global admin.

## Create a Role
- POST /acl/roles

   - Description: Create a new role (no-op if it already exists). Global admin only.
   - Body: `{ "role": string }`
   - Responses:
     - 200 OK: `{ role }`
     - 403 Forbidden: The requestor is not a global admin.

## Remove a Role
- DELETE /acl/roles/{role}

   - Description: Remove a role and all of its user assignments and directory permissions. Global admin only.
   - Responses:
     - 200 OK: `{ role }`
     - 403 Forbidden: The requestor is not a global admin.

## List Users in a Role
- GET /acl/roles/{role}/users

   - Description: List all users assigned to a role. Global admin only.
   - Responses:
     - 200 OK: `[{ user_id, user, role_id, role }]`
     - 403 Forbidden: The requestor is not a global admin.

# User Operations: /acl/users

## List Users
- GET /acl/users

   - Description: List all defined users. Global admin only.
   - Responses:
     - 200 OK: `[{ userId, user, created }]`
     - 403 Forbidden: The requestor is not a global admin.

## Create a User
- POST /acl/users

   - Description: Create a new user (no-op if it already exists). Global admin only.
   - Body: `{ "user": string }`
   - Responses:
     - 200 OK: `{ user }`
     - 403 Forbidden: The requestor is not a global admin.

## Remove a User
- DELETE /acl/users/{user}

   - Description: Remove a user and all of their role assignments. Global admin only.
   - Responses:
     - 200 OK: `{ user }`
     - 403 Forbidden: The requestor is not a global admin.

## List a User's Roles
- GET /acl/users/{user}/roles

   - Description: List all roles assigned to a user. A caller may always look up their own roles; looking up another user's roles requires the global admin role.
   - Responses:
     - 200 OK: `["role1", "role2", ...]`
     - 403 Forbidden: The requestor is neither `user` nor a global admin.

## Assign a Role to a User
- POST /acl/users/{user}/roles

   - Description: Assign a role to a user, creating either if needed. Global admin only.
   - Body: `{ "role": string }`
   - Responses:
     - 200 OK: `{ user, role }`
     - 403 Forbidden: The requestor is not a global admin.

## Remove a Role from a User
- DELETE /acl/users/{user}/roles/{role}

   - Description: Remove a role from a user. Global admin only.
   - Responses:
     - 200 OK: `{ user, role }`
     - 403 Forbidden: The requestor is not a global admin.

# Test a Permission

## Test a Permission
- GET /acl/test

   - Description: Test whether a user (or the public, if `user` is omitted) would have a specific permission on a file or directory. A system-wide diagnostic, so it requires the global admin role rather than admin on the target path's own ACL.
   - Query Parameters:
     - filePath (string, required): The file or directory path to test.
     - permission (string, required): One of `read`, `write`, `admin`.
     - user (string, optional): The target username to evaluate. Omit to test public access.
     - isFile (boolean, optional): Whether `filePath` is a file rather than a directory. Default `false`.
   - Responses:
     - 200 OK: `{ filePath, permission, user, hasPermission }`
     - 403 Forbidden: The requestor is not a global admin.
