# Role-Based Access Control (RBAC)

[Back to File System Overview](./fs.md)

CaskFS implements a role-based access control (RBAC) system to manage permissions for different users at the directory level. This allows for fine-grained control over who can read, write, or manage files and directories within the CaskFS file system.

Contents:
- [Roles](#roles)
- [Permissions](#permissions)
- [Principals](#principals)
- [Directory ACL](#directory-acl)
- [ACL CLI Methods](#acl-cli-methods)
- [ACL REST API](./acl-rest-api.md)


## Roles
All roles are assigned at an ACL at directory level and are inherited by all files and subdirectories within that directory until an new ACL is assigned at a subdirectory level.

The only predefined role is `admin` which has full permissions to read, write, and manage files and directories.  Otherwise, roles are user-defined and can be created as needed.

Users can be assigned multiple roles, and roles can be assigned to multiple users.

## Permissions
The following permissions are (currently) supported:
- **read**: Allows the user to read files and list directory contents.
- **write**: Allows the user to create, update, and delete files. As well as all read permissions.
- **admin**: Allows the user to create and update ACLs for directories. As well as all read and write permissions.

## Principals
A directory permission is always granted to a **principal**, which is either a role or a
single user:
- **role** (the default, and the common case): every member of the role gets the permission.
  Use this when a group of people should share access.
- **user**: the permission is granted to exactly that one user, with no role involved. Use
  this for a one-off grant to a specific person, without inventing a role just for them.

Both kinds of grant are stored, checked, and inherited by subdirectories identically - the
distinction only matters when you set or remove a grant, where you specify the principal's
type (`role` or `user`) alongside its name.

## Directory ACL
Each directory can have an Access Control List (ACL) which defines the which principals (roles or users) have which permissions for that directory.  Subdirectories will inherit the ACL of their parent directory unless a new ACL is defined for the subdirectory.

The default is no access.  Only members of the `admin` role can read, write, or manage files and directories.

### Public directories
Additionally directory ACLs have a public flag which, when set to true, grants any unauthenticated user **read** permissions.

## ACL CLI Methods

All `cask acl` subcommands work against both `direct-pg` and `http` environments (see
[CLI](../README.md#cli)) - over HTTP they call the [ACL REST API](./acl-rest-api.md). Directory
operations require `admin` permission on that directory (or the global `admin` role); role/user
operations require the global `admin` role.

### Add User
Add User to the CaskFS instance.

CLI: `cask acl user-add <username> [options]`

### Remove User
Remove User from the CaskFS instance.

CLI: `cask acl user-remove <username> [options]`

### List All Users
List every user defined on the CaskFS instance.

CLI: `cask acl user-list [options]`

### Add Role
Add a new role to the CaskFS instance.
CLI: `cask acl role-add <role-name> [options]`

### Remove Role
Remove a role from the CaskFS instance.
CLI: `cask acl role-remove <role-name> [options]`

### List All Roles
List every role defined on the CaskFS instance.

CLI: `cask acl role-list [options]`

### List Users or User Roles
List all users for a role or list all roles for a user. Any caller may look up their own
roles without needing the admin role (this is what `cask whoami` uses); looking up another
user's roles, or listing the users in a role, requires the global admin role.

CLI: `cask acl user-role-get [options]`

### Add User to Role
Add a user to a role.

CLI: `cask acl user-role-set <username> <role> [options]`

### Remove User from Role
Remove a user from a role.

CLI: `cask acl user-role-remove <username> <role> [options]`

### Get Directory ACL
Get the ACL for a directory. Each entry in `Permissions` shows the `permission`, the
`principalType` (`role` or `user`), and the `principalName`.

CLI: `cask acl get <directory> [options]`

### Set Directory Permission
Grant a permission to a principal (a role or a user) on a directory. `--type` defaults to
`role`, so existing scripts that omit it are unaffected.

CLI: `cask acl permission-set <directory> <principal> <permission> [-t role|user] [options]`

### Remove Directory Permission
Remove a principal's (a role's or a user's) permission on a directory. `--type` defaults to
`role`.

CLI: `cask acl permission-remove <directory> <principal> <permission> [-t role|user] [options]`

### Set Directory Public
Set the public flag for a directory.

CLI: `cask acl public-set <directory> <true|false>`

### Completely Remove Directory ACL
Remove the ACL for a directory.  The directory will inherit the ACL of its parent directory.

CLI: `cask acl remove <directory> [options]`

### Test Permissions
Test if a user has a specific permission for a directory.

CLI: `cask acl test <path> <username> <permission> [options]`