import { redirect } from '@sveltejs/kit'
import { planHref } from '$lib/routes/links'
import type { PageLoad } from './$types'

export const load: PageLoad = ({ params }) => {
  redirect(307, planHref(params.id))
}
