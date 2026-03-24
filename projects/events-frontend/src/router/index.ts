import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/event/:id',
      name: 'event-detail',
      component: () => import('@/views/EventDetailView.vue'),
    },
    {
      path: '/submit',
      name: 'submit-event',
      component: () => import('@/views/SubmitEventView.vue'),
    },
    {
      path: '/edit/:id',
      name: 'edit-event',
      component: () => import('@/views/EditEventView.vue'),
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: () => import('@/views/FavoritesView.vue'),
    },
    {
      path: '/category/:slug',
      name: 'category',
      component: () => import('@/views/CategoryLandingView.vue'),
    },
    {
      path: '/communities',
      name: 'communities',
      component: () => import('@/views/CommunitiesView.vue'),
    },
    {
      path: '/community/:slug',
      name: 'community-detail',
      component: () => import('@/views/CommunityDetailView.vue'),
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
