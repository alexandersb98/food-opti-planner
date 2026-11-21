import { useNavigate, useParams } from 'react-router'
import { useT } from '../../i18n/i18n'
import { toast } from '../../shell/toast'
import { IngredientForm } from './IngredientForm'

/** An ingredient's page (/ingredients/:id) or a new one (/ingredients/new):
 * the ingredient form, back to the Ingredients page after a save or a
 * delete. */
export function Ingredient() {
  const t = useT()
  const navigate = useNavigate()
  const { id: param } = useParams()
  const id = param === undefined ? null : Number(param)
  return (
    <IngredientForm
      key={id ?? 'new'}
      id={id}
      onSaved={(saved) => {
        toast(t('ingredients.page.saved', { name: saved.name }))
        void navigate('/ingredients')
      }}
      onDeleted={(deleted) => {
        toast(t('ingredients.page.deleted', { name: deleted.name }))
        void navigate('/ingredients')
      }}
    />
  )
}
