import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { apiFetch } from '../api.js'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [team, setTeam] = useState(null)
  const [inviteToken, setInviteToken] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const loadTeamContext = useCallback(async (sessionHint) => {
    try {
      let accessToken = sessionHint?.access_token
      if (!accessToken) {
        const r = await supabase.auth.getSession()
        accessToken = r?.data?.session?.access_token
      }
      if (!accessToken) {
        setProfile(null)
        setTeam(null)
        setInviteToken(null)
        setMembers([])
        return null
      }
      // Pass token so we never call getSession() from inside apiFetch while GoTrue may still be
      // resolving the outer getSession() chain (avoids deadlock → infinite "Loading…").
      const data = await apiFetch('/api/teams/me', { accessToken })
      setProfile(data.profile ?? null)
      setTeam(data.team ?? null)
      setInviteToken(data.invite_token ?? null)
      setMembers(Array.isArray(data.members) ? data.members : [])
      return data
    } catch {
      setProfile(null)
      setTeam(null)
      setInviteToken(null)
      setMembers([])
      return null
    }
  }, [])

  const bootstrapGen = useRef(0)

  useEffect(() => {
    const gen = ++bootstrapGen.current

    supabase.auth
      .getSession()
      .then(async (result) => {
        try {
          const session = result?.data?.session ?? null
          if (bootstrapGen.current !== gen) return
          setSession(session)
          setUser(session?.user ?? null)
          if (session) await loadTeamContext(session)
        } catch (e) {
          console.error('[Auth] Session bootstrap failed', e)
          if (bootstrapGen.current === gen) {
            setProfile(null)
            setTeam(null)
            setInviteToken(null)
            setMembers([])
          }
        } finally {
          if (bootstrapGen.current === gen) setLoading(false)
        }
      })
      .catch((e) => {
        console.error('[Auth] getSession failed', e)
        if (bootstrapGen.current === gen) setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session) {
        try {
          await loadTeamContext(session)
        } catch (e) {
          console.error('[Auth] Failed to refresh workspace', e)
        }
      } else {
        setProfile(null)
        setTeam(null)
        setInviteToken(null)
        setMembers([])
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [loadTeamContext])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setUser(null)
    setProfile(null)
    setTeam(null)
    setInviteToken(null)
    setMembers([])
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        team,
        inviteToken,
        members,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile: loadTeamContext,
        refreshTeam: loadTeamContext
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
