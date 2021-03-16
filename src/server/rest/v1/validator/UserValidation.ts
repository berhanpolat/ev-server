import { ImportedUser } from '../../../../types/User';
import Schema from './Schema';
import SchemaValidator from './SchemaValidator';
import fs from 'fs';
import global from '../../../../types/GlobalType';

export default class UserValidator extends SchemaValidator {
  private static instance: UserValidator|null = null;
  private userCreation: Schema;

  private constructor() {
    super('UserValidator');
    this.userCreation = JSON.parse(fs.readFileSync(`${global.appRoot}/assets/server/rest/v1/schemas/user/user-create-req.json`, 'utf8'));
  }

  public static getInstance(): UserValidator {
    if (!UserValidator.instance) {
      UserValidator.instance = new UserValidator();
    }
    return UserValidator.instance;
  }

  validateUserCreation(importedUser: ImportedUser): void {
    this.validate(this.userCreation, importedUser);
  }
}
