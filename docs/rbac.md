# Role-Based Access Control (RBAC)

[Back to File System Overview](./fs.md)

CaskFS implements a role-based access control (RBAC) system to manage permissions for different users at the directory level. This allows for fine-grained control over who can read, write, or manage files and directories within the CaskFS file system.

Contents:
- [Roles](#roles)
- [Permissions](#permissions)
- [Directory ACL](#directory-acl)
- [ACL CLI Methods](#acl-cli-methods)


## Roles
All roles are assigned at an ACL at directory level and are inherited by all files and subdirectories within that directory until an new ACL is assigned at a subdirectory level.

The only predefined role is `admin` which has full permissions to read, write, and manage files and directories.  Otherwise, roles are user-defined and can be created as needed.

Users can be assigned multiple roles, and roles can be assigned to multiple users.

## Permissions
The following permissions are (currently) supported:
- **read**: Allows the user to read files and list directory contents.
- **write**: Allows the user to create, update, and delete files. As well as all read permissions.
- **admin**: Allows the user to create and update ACLs for directories. As well as all read and write permissions.

## Directory ACL
Each directory can have an Access Control List (ACL) which defines the which roles have which permissions for that directory.  Subdirectories will inherit the ACL of their parent directory unless a new ACL is defined for the subdirectory.

The default is no access.  Only members of the `admin` role can read, write, or manage files and directories.

### Public directories
Additionally directory ACLs have a public flag which, when set to true, grants any unauthenticated user **read** permissions.

## ACL CLI Methods

### Add User
Add User to the CaskFS instance.

CLI: `cask acl user-add <username> [options]`

### Remove User
Remove User from the CaskFS instance.

CLI: `cask acl user-remove <username> [options]`

### Add Role
Add a new role to the CaskFS instance.
CLI: `cask acl role-add <role-name> [options]`

### Remove Role
Remove a role from the CaskFS instance.
CLI: `cask acl role-remove <role-name> [options]`

### List Users or User Roles
List all users for a role or list all roles for a user.

CLI: `cask acl user-role-get [options]`

### Add User to Role
Add a user to a role.

CLI: `cask acl user-role-set <username> <role> [options]`

### Remove User from Role
Remove a user from a role.

CLI: `cask acl user-role-remove <username> <role> [options]`

### Get Directory ACL
Get the ACL for a directory.

CLI: `cask acl get <directory> [options]`

### Set Directory Permission
Set role permissions for a directory.

CLI: `cask acl permission-set <directory> <role> <permission> [options]`

### Remove Directory Permission
Remove role permissions for a directory.

CLI: `cask acl permission-remove <directory> <role> <permission> [options]`

### Set Directory Public
Set the public flag for a directory.

CLI: `cask acl public-set <directory> <true|false>`

### Completely Remove Directory ACL
Remove the ACL for a directory.  The directory will inherit the ACL of its parent directory.

CLI: `cask acl remove <directory> [options]`

### Test Permissions
Test if a user has a specific permission for a directory.

CLI: `cask acl test <path> <username> <permission> [options]`