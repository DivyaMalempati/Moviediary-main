import { Redirect } from "wouter";

/** Discover lives on Add as tabs — keep /suggestions as a stable deep link. */
export default function SuggestionsPage() {
  return <Redirect to="/add?tab=search" />;
}
