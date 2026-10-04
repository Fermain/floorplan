import { redirect } from '@sveltejs/kit'
import { resolve } from '$app/paths'

// Projects lived at /p before the app moved under /app; old links and bookmarks still land on them.
export function load({ params, url }) {
  redirect(307, `${resolve('/app')}/p/${params.rest}${url.search}`)
}
