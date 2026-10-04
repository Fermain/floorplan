import { redirect } from '@sveltejs/kit'
import { resolve } from '$app/paths'

// The new-project walkthrough moved under /app with the rest of the app.
export function load({ url }) {
  redirect(307, `${resolve('/app/new')}${url.search}`)
}
