export class TokenObservationUnavailableError extends Error {
  constructor() {
    super("Token observations unavailable");
    this.name = "TokenObservationUnavailableError";
  }
}
