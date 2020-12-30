<?php

abstract class Brizy_Admin_Entity_AbstractManager implements Brizy_Admin_Entity_ManagerInterface
{

    /**
     * @param $post
     *
     * @param null $uid
     *
     * @return mixed
     */
    abstract protected function convertWpPostToEntity($post, $uid = null);

    /**
     * @param $type
     * @param $uid
     *
     * @return Brizy_Editor_Entity
     * @throws Exception
     * @todo:  refactor this as a single sql query
     *
     */
    protected function getEntityUidAndType($uid, $type)
    {
        $entities = get_posts(
            array(
                'post_type'   => $type,
                'post_status' => 'any',
                'meta_key'    => 'brizy_post_uid',
                'meta_value'  => $uid,
                'numberposts' => -1,
                'orderby'     => 'ID',
                'order'       => 'DESC',
            )
        );

        if (isset($entities[0])) {
            $block = $this->convertWpPostToEntity($entities[0]);
        } else {
            $block = null;
        }

        return $block;
    }

    /**
     * @param $type
     * @param array $args
     *
     * @return Brizy_Editor_Entity[]
     * @todo:  refactor this as a single sql query
     */
    protected function getEntitiesByType($type, $args = array())
    {

        $filterArgs = array(
            'post_type'      => $type,
            'posts_per_page' => -1,
            'post_status'    => 'publish',
            'orderby'        => 'ID',
            'order'          => 'ASC',
        );
        $filterArgs = array_merge($filterArgs, $args);

        $posts = get_posts($filterArgs);

        $entities = [];
        foreach ($posts as $apost) {
            $entities[] = $this->convertWpPostToEntity($apost);
        }

        return $entities;
    }

    protected function createEntityByType($uid, $type, $status = 'publish', $properties = null)
    {
        $name  = md5(time());
        $params = array(
            'post_title'  => $name,
            'post_name'   => $name,
            'post_status' => $status,
            'post_type'   => $type,
        );

        if(is_array($properties)) {
            $params = array_merge( $params, $properties );
        }

        $apost = wp_insert_post($params);

        if ($apost) {
            $brizyPost = $this->convertWpPostToEntity($apost, $uid);
            $brizyPost->set_uses_editor(true);
            $brizyPost->set_needs_compile(true);
            $brizyPost->setDataVersion(1);

            return $brizyPost;
        }

        return null;
    }

    /**
     * @param Brizy_Editor_Entity $entity
     */
    public function deleteEntity(Brizy_Editor_Entity $entity,$force_delete=false)
    {
        do_action('brizy_before_entity_delete', $entity);
        wp_delete_post($entity->getWpPostId(),$force_delete);
    }

    /**
     * @param Brizy_Editor_Entity $entity
     */
    public function trashEntity(Brizy_Editor_Entity $entity)
    {
        do_action('brizy_before_entity_delete', $entity);
        wp_trash_post($entity->getWpPostId());
    }

    /**
     * @param Brizy_Editor_Entity[] $entities
     * @param array $fields
     *
     * @return array
     */
    public function createResponseForEntities($entities, $fields = [])
    {
        $response = [];
        foreach ($entities as $entity) {
            $response[] = $entity->createResponse($fields);
        }

        return $response;
    }

}
