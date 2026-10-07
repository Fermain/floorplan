import { redirect } from '@sveltejs/kit'
import { exampleHref } from '$lib/routes/links'
import type { PageLoad } from './$types'

// A short address for an example on the site: it opens read-only, as a preview.
export const load: PageLoad = ({ params }) => {
  redirect(307, exampleHref(params.id))
}
