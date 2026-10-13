// Errors carrying a message that is safe and useful to show in the interface.
export class UserError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'UserError';
    this.status = status;
    this.expose = true;
  }
}
