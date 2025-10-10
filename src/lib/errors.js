export class MissingResourceError extends Error {
  constructor(resourceType, identifier) {
    super(`${resourceType} "${identifier}" does not exist`);
    this.name = "MissingResource";
    this.resourceType = resourceType;
    this.identifier = identifier;
  }
}

export class AclAccessError extends Error {
  constructor(message, user, filePath, permission) {
    super(message);
    this.name = 'AclAccessError';
    this.user = user || 'PUBLIC';
    this.filePath = filePath;
    this.permission = permission;
  }
}