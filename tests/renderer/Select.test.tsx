import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Select, type SelectOption } from '@renderer/components/shared/Select'

const options: SelectOption[] = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana', hint: 'yellow' },
  { value: 'c', label: 'Cherry' }
]

beforeEach(() => cleanup())

describe('Select', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(
      <Select value="" onChange={() => {}} options={options} placeholder="Pick one" />
    )
    expect(screen.getByText('Pick one')).toBeInTheDocument()
  })

  it('shows the selected label', () => {
    render(<Select value="b" onChange={() => {}} options={options} />)
    expect(screen.getByText('Banana')).toBeInTheDocument()
  })

  it('opens the listbox on click and selects an option', () => {
    const onChange = vi.fn()
    render(<Select value="a" onChange={onChange} options={options} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cherry'))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('closes on outside click', () => {
    render(<Select value="a" onChange={() => {}} options={options} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens with ArrowDown and navigates with the keyboard', () => {
    const onChange = vi.fn()
    render(<Select value="a" onChange={onChange} options={options} />)
    const button = screen.getByRole('button')
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('b')
  })

  it('closes on Escape', () => {
    render(<Select value="a" onChange={() => {}} options={options} />)
    const button = screen.getByRole('button')
    fireEvent.click(button)
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('clamps ArrowUp navigation at the first option', () => {
    const onChange = vi.fn()
    render(<Select value="c" onChange={onChange} options={options} />)
    const button = screen.getByRole('button')
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    fireEvent.keyDown(button, { key: 'ArrowUp' })
    fireEvent.keyDown(button, { key: 'ArrowUp' })
    fireEvent.keyDown(button, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('a')
  })

  it('renders option hints', () => {
    render(<Select value="a" onChange={() => {}} options={options} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('yellow')).toBeInTheDocument()
  })
})
