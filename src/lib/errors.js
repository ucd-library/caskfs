export class MissingResourceError extends Error {
  constructor(resourceType, identifier) {
    super(`${resourceType} "${identifier}" does not exist`);
    this.name = "MissingResource";
    this.resourceType = resourceType;
    this.identifier = identifier;
  }
}