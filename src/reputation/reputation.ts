import type { AppContext } from "../app_context";
import type { Reputation } from "../node_manager/types";

export class ReputationImpl implements Reputation {
  private _bannedProviders: string[] = [];

  public bannedProviders(): object {
    return this._bannedProviders;
  }

  isProviderBanned(providerId: string): boolean {
    return this._bannedProviders.includes(providerId);
  }

  numberOfBannedProviders(): number {
    return this._bannedProviders.length;
  }

  reset(ctx: AppContext): void {
    ctx.L().info("Resetting banned providers list");
    this._bannedProviders = [];
  }

  /**
   * Adds a provider to the banned list.
   * @param ctx - The application context for logging.
   * @param providerId - The ID of the provider to ban.
   * @returns true if the provider was already banned, false otherwise.
   */
  ban(ctx: AppContext, providerId: string, _reason: string): boolean {
    const wasBannedBefore = this.isProviderBanned(providerId);
    if (wasBannedBefore) {
      return true;
    }
    this._bannedProviders.push(providerId);
    return false;
  }
}
