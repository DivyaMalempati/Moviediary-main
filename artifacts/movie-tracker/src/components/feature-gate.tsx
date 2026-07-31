import type { ComponentType } from "react";
import { Redirect } from "wouter";
import { isFeatureEnabled, type AppFeature } from "@/lib/features";

/** Hide lab routes from the MVP build — bounce to Watched. */
export function FeatureGate({
  feature,
  component: Component,
}: {
  feature: AppFeature;
  component: ComponentType;
}) {
  if (!isFeatureEnabled(feature)) {
    return <Redirect to="/watched" />;
  }
  return <Component />;
}
