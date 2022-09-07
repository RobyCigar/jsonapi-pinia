import { reactive, watch } from 'vue'
import { useQuery, useMutation } from 'vue-query'
// prettier-ignore
import { indexRequest, getRequest, createRequest, updateRequest, deleteRequest } from './requests'
import { processIndexData, processGetData } from './utils'
import { QueryObserverOptions } from 'react-query'
import type { ResourceObject, DocWithData, NewResourceObject } from './types'

interface QueryOptions {
  index?: QueryObserverOptions
  get?: QueryObserverOptions
  create?: QueryObserverOptions
  update?: QueryObserverOptions
  delete?: QueryObserverOptions
}

export const storeVueQuery = (
  store: any,
  apiResourceType?: string,
  queryOptions?: QueryOptions
) => {
  const resourceType = apiResourceType || store.$id

  const indexKey = reactive([resourceType, {}])
  const indexQuery = useQuery(
    indexKey,
    () => indexRequest(resourceType, indexKey[1]),
    {
      keepPreviousData: true,
      staleTime: 10000,
      ...queryOptions?.index
    }
  )
  const index = async (queryParams: { [key: string]: any } = {}) => {
    indexKey[1] = queryParams
    // Reset the data to the cache of vue-query because it could have been changed by another store with relationships
    if (indexQuery.data.value) {
      processIndexData(indexQuery.data.value, store)
    }
  }

  watch(indexQuery.data, (newData: DocWithData) => {
    processIndexData(newData, store)
  })

  const getKey = reactive([resourceType, '', {}])
  const getQuery = useQuery(
    getKey,
    () => getRequest(resourceType, getKey[1], getKey[2]),
    {
      staleTime: 10000,
      ...queryOptions?.get
    }
  )
  const get = async (id: string, queryParams: { [key: string]: any } = {}) => {
    getKey[1] = id
    getKey[2] = queryParams
    // Reset the data to the cache of vue-query because it could have been changed by another store with relationships
    if (getQuery.data.value) {
      processGetData(getQuery.data.value, store)
    }
  }

  watch(getQuery.data, (newData: DocWithData) => {
    processGetData(newData, store)
  })

  const createQuery = useMutation(
    (body: any) => createRequest(resourceType, body),
    {
      onSuccess: (json: DocWithData | string, body: NewResourceObject) => {
        if (typeof json === 'string') {
          store.data.value[body.id] = body
        } else {
          const elementData = json.data as ResourceObject
          store.data.value[elementData.id] = elementData
        }
      },
      ...queryOptions?.create
    }
  )
  const create = async (body: NewResourceObject) => {
    createQuery.mutate(body)
  }

  const updateQuery = useMutation(
    (params: { id: string; body: any }) =>
      updateRequest(resourceType, params.id, params.body),
    {
      onSuccess: (json: DocWithData | string, variables: { id: string }) => {
        if (typeof json === 'string') {
          store.get(variables.id)
        } else {
          const elementData = json.data as ResourceObject
          store.data.value[elementData.id] = elementData
        }
      },
      ...queryOptions?.update
    }
  )
  const update = async (id: string, body: ResourceObject) => {
    updateQuery.mutate({ id, body })
  }

  const deleteQuery = useMutation(
    (id: string) => deleteRequest(resourceType, id),
    {
      onSuccess: (_: any, id: string) => {
        delete store.data.value[id]
      },
      ...queryOptions?.delete
    }
  )
  const vDelete = async (id: string) => {
    deleteQuery.mutate(id)
  }

  return {
    index,
    indexQuery,
    get,
    getQuery,
    create,
    createQuery,
    update,
    updateQuery,
    delete: vDelete,
    deleteQuery
  }
}
