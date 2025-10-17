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

export class HashNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HashNotFoundError';
  }
}

export class DuplicateFileError extends Error {
  constructor(filePath) {
    super(`File already exists: ${filePath}`);
    this.filePath = filePath;
    this.name = 'DuplicateFileError';
  }
}